var $ = require('jQuery');
var _ = require('lodash');
var sylvester = require('../lib/sylvester-node.js');

var Deconstruction = require("./Deconstruction.js");
var MarkGroup = require("./MarkGroup.js");
var Mapping = require('./Mapping.js');

var d3;
if (typeof document != 'undefined')
    d3 = require('../lib/d3-decon-fixed.min.js');
else
    d3 = require('d3');

var pageDeconstruct = function() {
    var svgNodes = $('svg');
    var deconstructed = [];

    $.each(svgNodes, function (i, svgNode) {
        var children = $(svgNode).find('*');
        var isD3Node = false;
        $.each(children, function (i, child) {
            if (child.__data__) {
                isD3Node = true;
                return false;
            }
        });

        if (isD3Node) {
            var decon = deconstruct(svgNode);
            deconstructed.push(decon);
        }
    });

    return deconstructed;
};

var deconstruct = function(svgNode) {
    var marks = extractMarkData(svgNode);
    var axes = extractAxes(svgNode);
    var lineExpandedMarks = expandLines(marks);

    lineExpandedMarks.forEach(function(mark) {
        if (mark.data !== undefined) {
            mark.data.deconID = mark.deconID;
        }
        if (mark.lineID !== undefined) {
            mark.data.lineID = mark.lineID;
        }
    });

    var grouped = groupMarks(lineExpandedMarks);

    grouped.forEach(function(group) {
        group.mappings = extractMappings(group);
    });
    grouped = recombineGroups(grouped);
    grouped = updateDerivedFields(grouped);
    grouped.forEach(function(group) {
        group.mappings = extractMappings(group);
    });

    var svgSize = {
        "width": +$(svgNode).attr("width"),
        "height": +$(svgNode).attr("height")
    };

    var decon = new Deconstruction(svgSize, grouped, marks, axes);
    decon = relateMappingRanges(decon);
    decon = matchDerived(decon);

    return decon;
};

var recombineGroups = function recombineGroups(groups) {
    var removed = 0;
    for (var i = 0; i < groups.length - removed; ++i) {
        var group1 = MarkGroup.fromJSON(groups[i]);

        for (var j = i+1; j < groups.length - removed; ++j) {
            var group2 = MarkGroup.fromJSON(groups[j]);
            if (i === j) continue;

            if (shouldCombine(group1, group2)) {
                group1.addGroup(group2);
                groups.splice(j, 1);
                removed++;
            }
        }
    }
    return groups;
};

var shouldCombine = function shouldCombine(group1, group2) {
    var group1Data = _.keys(group1.data);
    var group2Data = _.keys(group2.data);
    var allDataFields = _.union(group1Data, group2Data);
    if (allDataFields.length > group1Data.length || group1Data.length !== group2Data.length) {
        return false;
    }

    if (group1.name || group2.name) {
        return false;
    }

    var equalMappings = true;
    for (var i = 0; i < group1.mappings.length; ++i) {
        var mapping1 = Mapping.fromJSON(group1.mappings[i]);
        if (mapping1.getData() === "deconID") continue;

        var foundEqual = false;
        for (var j = 0; j < group2.mappings.length; ++j) {
            var mapping2 = Mapping.fromJSON(group2.mappings[j]);
            if (mapping1.isEqualTo(mapping2)) {
                foundEqual = true;
            }
        }
        if (!foundEqual) equalMappings = false;

    }
    return equalMappings;
};

var matchDerived = function(decon) {
    return decon;
};

var updateDerivedFields = function(markGroups) {
    var orderingsFound = [];

    for (var i = 0; i < markGroups.length; ++i) {
        var markGroup = markGroups[i];
        var deconIDs = markGroup.data['deconID'];
        delete markGroup.data['deconID'];
        //markGroup.data['deconID' + i] = deconIDs;

        var attrs = ['xPosition', 'yPosition', 'width', 'height'];
        var prefix = '_deriv_';

        attrs.forEach(function(attr) {
            //We drop if all values aren't unique.
            //if (_.uniq(markGroup.attrs[attr]).length === markGroup.attrs[attr].length) {
                var ordering = _.map(markGroup.attrs[attr], function(attrVal, j) {
                    return {val: attrVal, ord: j};
                });
            //var ordering = _.orderBy(markGroup.attrs[attr], function(attrVal) { return attrVal; });

                orderingsFound.push({group: markGroup, attr: attr, fieldName: prefix + attr + '_' + i,  ordering: ordering});

                ordering = _.sortBy(ordering, function(orderedVal) {return orderedVal.val;});
                ordering = _.map(ordering, function(orderedVal) {return orderedVal.ord;});
                markGroup.data[prefix + attr + '_' + i] = ordering;
            //}
        });

    }

    var orderingsByAttr = _.groupBy(orderingsFound, function(ordering) { return ordering.attr; });
    var attrs = _.keys(orderingsByAttr);
    attrs.forEach(function(attr) {
        var orderings = orderingsByAttr[attr];
        var orderingSets = [];

        for (var i = 0; i < orderings.length; ++i) {
            var ordering = orderings[i];
            var orderingSetFound = false;
            orderingSets.forEach(function(orderingSet) {
                if (sameOrdering(orderingSet[0].ordering, ordering.ordering)) {
                    orderingSet.push(ordering);
                }
            });

            if (!orderingSetFound) {
                orderingSets.push([ordering]);
            }
        }

        orderingSets.forEach(function(orderingSet) {
            var fieldName = orderingSet[0].fieldName;
            orderingSet.forEach(function(ordering) {
                var orderingData = ordering.group.data[ordering.fieldName];
                delete ordering.group.data[ordering.fieldName];
                ordering.group.data[fieldName] = orderingData;
                ordering.group.data = fixEmptyFields(ordering.group.data);
            });
        });
    });

    return markGroups;
};

var fixEmptyFields = function(obj) {
    var keys = _.keys(obj);
    var newObj = {};
    keys.forEach(function(key) {
        if (obj[key] !== undefined) {
            newObj[key] = obj[key];
        }
    });
    return newObj;
};

var sameOrdering = function(ordering1, ordering2) {
    var ordering1Obj = {};
    ordering1.forEach(function(row) { ordering1Obj[row.ord] = Math.round(row.val); });
    var ordering2Obj = {};
    ordering2.forEach(function(row) { ordering2Obj[row.ord] = Math.round(row.val); });
    return _.isEqual(ordering1Obj, ordering2Obj);
};

var relateMappingRanges = function(decon) {
    var attrs = _.keys(decon.groups[0].attrs);
    var mappingSetsByAttr = {};

    attrs.forEach(function(attr) {
        var mappingsForAttr = decon.getAllMappingsForAttr(attr);
        var mappingSets = [];
        mappingsForAttr.forEach(function(mapping) {
            var mappingRange;
            if (mapping.type === "linear") {
                mappingRange = [mapping.params.attrMin, mapping.params.attrMax];
            }
            else if (mapping.type === "nominal") {
                mappingRange = _.values(mapping.params);
            }
            else {
                return;
            }

            if (mapping.data[0] === "tick") { return; }

            var mappingRef = {
                data: mapping.type === "linear" ? mapping.data[0] : mapping.data,
                attr: mapping.attr,
                type: mapping.type,
                range: mappingRange,
                groupID: _.indexOf(decon.groups, mapping.group)
            };

            var foundMappingSet = false;
            mappingSets.forEach(function(mappingSet) {
                if (belongsToSet(mappingRef, mappingSet)) {
                    updateMappingSetWithMapping(mappingRef, mappingSet);
                    foundMappingSet = true;
                }
            });
            if (!foundMappingSet) {
                mappingSets.push({
                    mappingRefs: [mappingRef],
                    attributes: _.clone(mappingRange),
                    type: mapping.type
                });
            }
        });
        mappingSetsByAttr[attr] = mappingSets;
        for (var i = 0; i < mappingSets.length; ++i) {
            var mappingSet = mappingSets[i];

            if (typeof mappingSet.attributes[0] !== 'number' || mappingSet.attributes.length > 2) continue;
            //
            //var maxRangeMappingRef = _.sortBy(mappingSet.mappingRefs, function(mapping) {
            //    return Math.abs(mapping.range[1] - mapping.range[0]);
            //});
            //maxRangeMappingRef = maxRangeMappingRef[0];
            //
            //var maxRangeMapping = MarkGroup.fromJSON(decon.groups[maxRangeMappingRef.groupID])
            //                               .getMapping(maxRangeMappingRef.data, maxRangeMappingRef.attr);
            //var maxMappingDataRange = [maxRangeMapping.invert(maxRangeMappingRef.range[0]), maxRangeMapping.invert(maxRangeMappingRef.range[1])];

            var minGroupDataVal = _.min(mappingSet.mappingRefs, function(mappingRef) {
                var group = decon.groups[mappingRef.groupID];
                return _.min(group.data[mappingRef.data]);
            });
            minGroupDataVal = _.min(decon.groups[minGroupDataVal.groupID].data[minGroupDataVal.data]);

            var maxGroupDataVal = _.max(mappingSet.mappingRefs, function(mappingRef) {
                var group = decon.groups[mappingRef.groupID];
                return _.max(group.data[mappingRef.data]);
            });
            maxGroupDataVal = _.max(decon.groups[maxGroupDataVal.groupID].data[maxGroupDataVal.data]);

            for (var j = 0; j < mappingSet.mappingRefs.length; ++j) {
                var mappingRef = mappingSet.mappingRefs[j];
                var mapping = decon.groups[mappingRef.groupID].getMapping(mappingRef.data, mappingRef.attr);
                //mapping.attrRange = _.clone(mappingSet.attributes);
                mapping.dataRange = [minGroupDataVal, maxGroupDataVal];
                mapping.attrRange = [mapping.map(minGroupDataVal), mapping.map(maxGroupDataVal)];
            }
        }
    });
    decon.mappingSets = mappingSetsByAttr;
    return decon;
};

var belongsToSet = function(mappingRef, mappingSet) {
    if (mappingRef.type === "linear" && mappingSet.type === "linear" && mappingRef.data !== "tick") {
        return rangeOverlaps(mappingSet.attributes, mappingRef.range);
    }
    else if (mappingRef.type === "nominal" && mappingSet.type === "nominal") {
        return _.intersection(_.values(mappingRef.params), mappingRef.range).length >= 1;
    }
    return false;
};

var rangeOverlaps = function(range1, range2) {
    var range1Min = _.min(range1) - 2;
    var range1Max = _.max(range1) + 2;
    var range2Min = _.min(range2);
    var range2Max = _.max(range2);

    var noOverlap = (range1Min <= range2Min && range1Max <= range2Min) || (range1Min >= range2Max && range1Max >= range2Max);
    return !noOverlap;
};

var updateMappingSetWithMapping = function(mappingRef, mappingSet) {
    if (mappingRef.type === "linear" && mappingRef.data[0] !== "tick") {
        if (mappingRef.range[0] < mappingSet.attributes[0]) {
            mappingSet.attributes[0] = mappingRef.range[0];
        }
        if (mappingRef.range[1] > mappingSet.attributes[1]) {
            mappingSet.attributes[1] = mappingRef.range[1];
        }
        mappingSet.mappingRefs.push(mappingRef);
    }
    else if (mappingRef.type === "nominal") {
        mappingSet.attributes = _.union(mappingSet.attributes, _.values(mappingRef.range));
        mappingSet.mappingRefs.push(mappingRef);
    }
};

var isDerived = function(fieldName) {
    var derivedRegex = /_deriv_*/;
    return fieldName.match(derivedRegex) || fieldName === 'lineID';
};

var groupMarks = function(marks) {
    var dataSchemas = [];
    marks.forEach(function(mark) {
        var currSchema = _.keys(mark.data);

        // If there isn't a schema, we won't group it!
        if (_.isEqual(currSchema, [])) {
            return;
        }

        var foundSchema = false;
        for (var j = 0; j < dataSchemas.length; ++j) {
            var sameNodeType = (dataSchemas[j].nodeType === mark.attrs['shape']);
            var sameAxis = (dataSchemas[j].axis === mark.axis);

            if (_.intersection(currSchema, dataSchemas[j].schema).length == currSchema.length
                && sameNodeType && sameAxis) {
                foundSchema = true;
                dataSchemas[j].ids.push(mark.deconID);
                dataSchemas[j].nodeAttrs.push(mark.nodeAttrs);

                // Not using _.each for this because there could be "length" data which
                // would break underscore's ducktyping
                for (var dataAttr in mark.data) {
                    if (mark.data.hasOwnProperty(dataAttr)) {
                        dataSchemas[j].data[dataAttr].push(mark.data[dataAttr]);
                    }
                }

                _.each(mark.attrs, function (val, attr) {
                    dataSchemas[j].attrs[attr].push(val);
                });
                break;
            }
        }

        if (!foundSchema) {
            var newSchema = {
                schema: currSchema,
                nodeType: mark.attrs['shape'],
                ids: [mark.deconID],
                data: {},
                attrs: {},
                nodeAttrs: [mark.nodeAttrs],
                isLine: mark.attrs['shape'] === 'linePoint'
            };

            if (mark.axis) {
                newSchema.axis = mark.axis;
                if (mark.attrs['shape'] === 'text') {
                    newSchema.name = mark.axis + '-labels';
                }
                else if (mark.attrs['shape'] === 'line') {
                    newSchema.name = mark.axis + '-ticks';
                }
                else if (mark.attrs['shape'] === 'linePoint') {
                    newSchema.name = mark.axis + '-line';
                }
            }

            for (var dataAttr in mark.data) {
                if (mark.data.hasOwnProperty(dataAttr)) {
                    newSchema.data[dataAttr] = [mark.data[dataAttr]];
                }
            }

            _.each(mark.attrs, function (val, attr) {
                newSchema.attrs[attr] = [val];
            });

            dataSchemas.push(newSchema);
        }
    });

    return dataSchemas;
};

var expandLines = function(marks) {
    var removed = 0;
    for (var i = 0; i < marks.length - removed; ++i) {
        var mark = marks[i - removed];
        var lineData = getLineData(mark);

        if (lineData !== undefined) {
            marks.splice(i - removed, 1);
            removed++;
            var newMarks = getLinePoints(mark, lineData);
            Array.prototype.push.apply(marks, newMarks);
        }
    }
    return marks;
};

var arrayLikeObject = function(obj) {
    var length = 0;
    for (var attr in obj) {
        if (attr !== "length" && isNaN(+attr)) {
            return undefined;
        }
        ++length;
    }

    var array = [];
    for (var i = 0; i < length; ++i) {
        if (!obj.hasOwnProperty(i)) {
            return undefined;
        }
        else {
            array.push(obj[i]);
        }
    }

    return array;
};

var getLinePoints = function(mark, lineData) {
    var linePointPositions = getLinePointPositions(mark);
    var linePoints = [];

    // If we have a basis line we should delete the irrelevant points
    if (lineData.array.length < mark.node.animatedPathSegList.length) {
        linePointPositions.splice(1, 1);
        linePointPositions.splice(linePointPositions.length-2, 1);
    }

    lineData.array.forEach(function(arrayItem, j) {
        var ptData = {};

        if (typeof arrayItem === "object") {
            ptData = _.extend(ptData, arrayItem);
        }
        else {
            var type = typeof arrayItem;
            ptData[type] = arrayItem;
        }
        _.extend(ptData, lineData.other);

        var newMarkAttrs = _.extend({}, mark.attrs);
        newMarkAttrs['xPosition'] = linePointPositions[j].x;
        newMarkAttrs['yPosition'] = linePointPositions[j].y;
        newMarkAttrs['shape'] = 'linePoint';

        var newMark = {
            data: ptData,
            attrs: newMarkAttrs,
            nodeAttrs: _.clone(mark.nodeAttrs),
            lineID: j,
            deconID: mark.deconID,
            axis: mark.axis
        };
        linePoints.push(newMark);
    });

    return linePoints;
};

var getLinePointPositions = function(mark) {
    var segs = mark.node.animatedPathSegList;
    var currX;
    var currY;
    var linePointPositions = [];
    for (var i = 0; i < segs.length; ++i) {
        var seg = segs[i];
        if (seg.x !== undefined)
            currX = seg.x;
        if (seg.y !== undefined)
            currY = seg.y;

        var transformedPt = transformedPoint(currX, currY, mark.node);
        linePointPositions.push({
            x: transformedPt.x,
            y: transformedPt.y
        });
    }
    return linePointPositions;
};

var getLineData = function(mark) {
    var validLineArray = function(mark, dataArray) {
        return mark.node.animatedPathSegList.length === dataArray.length
            || mark.node.animatedPathSegList.length === dataArray.length+2;
    };

    if (mark.attrs['shape'] === 'path') {
        var dataArray;
        var otherData = {};
        var coercedArray = arrayLikeObject(mark.data);

        if (mark.data instanceof Array && validLineArray(mark, mark.data)) {
            dataArray = _.clone(mark.data);
        }
        else if (coercedArray && validLineArray(mark, coercedArray)) {
            dataArray = _.clone(coercedArray);
        }
        else if (mark.data instanceof Object) {
            for (var attr in mark.data) {
                coercedArray = arrayLikeObject(mark.data[attr]);

                if (mark.data[attr] instanceof Array && validLineArray(mark, mark.data[attr])) {
                    dataArray = _.clone(mark.data[attr]);
                }
                else if (coercedArray && validLineArray(mark, coercedArray)) {
                    dataArray = _.clone(coercedArray);
                }
                else {
                    otherData[attr] = _.clone(mark.data[attr]);
                }
            }
        }

        if (dataArray !== undefined) {
            return {
                array: dataArray,
                other: otherData
            };
        }
    }

    return undefined;
};

var extractNodeAttrs = function(nodes) {
    var nodeAttrs = [];
    _.each(nodes, function(node) {
        var attrData = {};
        for (var i = 0; i < node.attributes.length; ++i) {
            var attr = node.attributes[i];
            attrData[attr.name] = attr.value;
        }
        attrData.text = $(node).text();
        nodeAttrs.push(attrData);
    });
    return nodeAttrs;
};

function extractMappings(schema) {
    var allMappings = extractNominalMappings(schema).concat(extractMultiLinearMappings(schema));
    return filterExtraMappings(allMappings);
}

/**
 * Given a schema object, returns a list of mappings between data and attribute values in the schema.
 * @param schema
 * @returns {Array}
 */
function extractNominalMappings (schema) {
    var nominalMappings = [];
    _.each(_.keys(schema.data), function (schemaItem) {
        var dataArray = schema.data[schemaItem];

        var attrNames = _.keys(schema.attrs);
        _.each(attrNames, function (attrName) {
            var attrArray = schema.attrs[attrName];
            var pairMapping = extractNominalMapping(schemaItem, attrName, dataArray, attrArray);
            nominalMappings = nominalMappings.concat(pairMapping);
        });
    });
    return nominalMappings;
}

/**
 * Given a data field and attribute name and value array, returns an array of
 * mappings between the field and attribute.
 * @param dataName
 * @param attrName
 * @param dataArray
 * @param attrArray
 * @returns {Array}
 */
function extractNominalMapping (dataName, attrName, dataArray, attrArray) {
    if(typeof attrArray[0] === "object") {
        /** @TODO Handle linear mappings on colors correctly. */
        /** @TODO Detect colors rather than all objects. */
        attrArray = _.map(attrArray, function(color) {return "rgb(" + color.r +
            "," + color.g + "," + color.b + ")"});
    }

    var mapping = {};
    _.each(dataArray, function(dataVal, i) {
        if (mapping.hasOwnProperty(dataVal)) {
            mapping[dataVal].push(attrArray[i]);
        }
        else {
            mapping[dataVal] = [attrArray[i]];
        }
    });

    for (var dataVal in mapping) {
        mapping[dataVal] = _.uniq(mapping[dataVal]);
        if (mapping[dataVal].length > 1) {
            return [];
        }
    }

    var mappedVals = _.flatten(_.values(mapping));

    // If multiple attr values are in the range, no one-to-one
    if (_.uniq(mappedVals).length <  mappedVals.length) {
        return [];
    }

    // If it is a trivial mapping, don't save it
    if (_.keys(mapping).length === 1) {
        return [];
    }

    _.each(_.keys(mapping), function(key) {
        mapping[key] = mapping[key][0];
    });

    return [{
        type: 'nominal',
        params: mapping,
        data: dataName,
        attr: attrName
    }];
}

function filterExtraMappings (schemaMappings) {
    var attrsWithLinearMapping = [];
    var attrsWithDerivedMapping = [];
    _.each(schemaMappings, function(schemaMapping) {
        if (schemaMapping.type === "linear") {
            attrsWithLinearMapping.push(schemaMapping.attr);
        }
        else if(schemaMapping.type === "derived") {
            attrsWithDerivedMapping.push(schemaMapping.attr);
        }
    });
    var removed = 0;
    var numMappings = schemaMappings.length;
    for(var ind = 0; ind < numMappings; ++ind) {
        var schemaMapping = Mapping.fromJSON(schemaMappings[ind-removed]);
        var hasLinear = attrsWithLinearMapping.indexOf(schemaMapping.attr) !== -1;
        var hasDerived = attrsWithDerivedMapping.indexOf(schemaMapping.attr) !== -1;
        if(schemaMapping.type === 'nominal' && (hasLinear || hasDerived)) {
            schemaMappings.splice(ind-removed, 1);
            removed++;
        }
        else if(schemaMapping.type === 'derived' && hasLinear) {
            schemaMappings.splice(ind-removed, 1);
            removed++;
        }
        else if(isDerived(schemaMapping.getData())) {
            var attr = schemaMapping.getData().match(/_deriv_(.+)_\d*/);
            attr = attr && attr.length > 1 ? attr[1] : null;

            if (schemaMapping.attr !== attr) {
                schemaMappings.splice(ind-removed, 1);
                removed++;
            }
        }
    }

    return schemaMappings;
}


function extractMultiLinearMappings(schema) {
    var numberFields = [];
    var numberAttrs = [];
    for (var field in schema.data) {
        if (typeof schema.data[field][0] === "number") {
            numberFields.push(field);
        }
    }
    for (var attr in schema.attrs) {
        if (typeof schema.attrs[attr][0] === "number") {
            numberAttrs.push(attr);
        }
    }

    var allLinearMappings = [];

    _.each(numberAttrs, function(attr) {
        for (var i = 1; i <= 3; ++i) {
            var combinations = k_combinations(numberFields, i);
            var mappings = [];
            _.each(combinations, function(fieldSet) {
                var xMatData = [];
                for(var i = 0; i < schema.data[numberFields[0]].length; ++i) {
                    var row = [1];
                    for(var j = 0; j < fieldSet.length; ++j) {
                        var fieldName = fieldSet[j];
                        row.push(schema.data[fieldName][i]);
                    }
                    xMatData.push(row);
                }
                var xMatrix = sylvester.$M(xMatData);
                var yVector = sylvester.$V(schema.attrs[attr]);
                var coeffs = findCoefficients(xMatrix, yVector);
                var err = 0;
                if (coeffs) {
                    coeffs = coeffs.elements;
                    err = findRSquaredError(xMatrix, yVector, coeffs);
                }

                if (err > 0.9999) {
                    var attrMin = _.min(schema.attrs[attr]);
                    var attrMax = _.max(schema.attrs[attr]);
                    var mapping;
                    mapping = {
                        type: 'linear',
                        data: fieldSet.reverse(),
                        attr: attr,
                        params: {
                            attrMin: attrMin,
                            attrMax: attrMax,
                            coeffs: coeffs.reverse(),
                            err: err
                        }
                    };

                    if (_.filter(fieldSet, function(field) {return isDerived(field);}).length > 0) {
                        mapping.type = 'derived';
                    }

                    mappings.push(mapping);
                }

            });
            if (mappings.length > 0) {
                allLinearMappings.push.apply(allLinearMappings, mappings);
                break;
            }
        }
    });
    return allLinearMappings;
}


function findRSquaredError(xMatrix, yVector, coeffs) {
    var squaredError = 0;
    var sumSquares = 0;

    var sum = yVector.elements.reduce(function(a, b) { return a + b });
    var yAvg = sum / yVector.elements.length;

    for (var i = 1; i < yVector.elements.length+1; ++i) {
        var pred = 0;
        for (var j = 1; j < xMatrix.cols()+1; ++j) {
            pred += xMatrix.e(i, j) * coeffs[j-1];
        }
        squaredError += (yVector.e(i) - pred) * (yVector.e(i) - pred);
        sumSquares += (yVector.e(i) - yAvg) * (yVector.e(i) - yAvg);
    }

    return 1 - (squaredError / sumSquares);
}

/**
 * K-combinations
 *
 * Get k-sized combinations of elements in a set.
 *
 * Usage:
 *   k_combinations(set, k)
 *
 * Parameters:
 *   set: Array of objects of any type. They are treated as unique.
 *   k: size of combinations to search for.
 *
 * Return:
 *   Array of found combinations, size of a combination is k.
 *
 * Examples:
 *
 *   k_combinations([1, 2, 3], 1)
 *   -> [[1], [2], [3]]
 *
 *   k_combinations([1, 2, 3], 2)
 *   -> [[1,2], [1,3], [2, 3]
 *
 *   k_combinations([1, 2, 3], 3)
 *   -> [[1, 2, 3]]
 *
 *   k_combinations([1, 2, 3], 4)
 *   -> []
 *
 *   k_combinations([1, 2, 3], 0)
 *   -> []
 *
 *   k_combinations([1, 2, 3], -1)
 *   -> []
 *
 *   k_combinations([], 0)
 *   -> []
 */
function k_combinations(set, k) {
    var i, j, combs, head, tailcombs;

    if (k > set.length || k <= 0) {
        return [];
    }

    if (k == set.length) {
        return [set];
    }

    if (k == 1) {
        combs = [];
        for (i = 0; i < set.length; i++) {
            combs.push([set[i]]);
        }
        return combs;
    }

    // Assert {1 < k < set.length}

    combs = [];
    for (i = 0; i < set.length - k + 1; i++) {
        head = set.slice(i, i+1);
        tailcombs = k_combinations(set.slice(i + 1), k - 1);
        for (j = 0; j < tailcombs.length; j++) {
            combs.push(head.concat(tailcombs[j]));
        }
    }
    return combs;
}

/**
 * Combinations
 *
 * Get all possible combinations of elements in a set.
 *
 * Usage:
 *   combinations(set)
 *
 * Examples:
 *
 *   combinations([1, 2, 3])
 *   -> [[1],[2],[3],[1,2],[1,3],[2,3],[1,2,3]]
 *
 *   combinations([1])
 *   -> [[1]]
 */
function combinations(set) {
    var k, i, combs, k_combs;
    combs = [];

    // Calculate all non-empty k-combinations
    for (k = 1; k <= set.length; k++) {
        k_combs = k_combinations(set, k);
        for (i = 0; i < k_combs.length; i++) {
            combs.push(k_combs[i]);
        }
    }
    return combs;
}

function findCoefficients(xMatrix, yVector) {
    var xTrans = xMatrix.transpose();
    var inv = xTrans.multiply(xMatrix).inverse();
    if (inv) {
        return inv.multiply(xTrans).multiply(yVector);
    }
    return null;
}

function checkLine(data, attrs, nodeAttrs, node, id) {
    if (node.tagName.toLowerCase() !== "path") {
        return null;
    }


    var dataArray = [];
    var otherAttrs = {};
    if (data instanceof Array) {
        dataArray = data;
    }
    else if (data instanceof Object) {
        for (var attr in data) {
            if (data[attr] instanceof Array) {
                dataArray = data[attr];
            }
            else {
                otherAttrs[attr] = data[attr];
            }
        }
    }
    else {
        return null;
    }

    var segs = node.animatedPathSegList;
    if (segs.length === 0) {
        return undefined;
    }
    if (segs[0].pathSegType !== 2) {
        return undefined;
    }

    var lineLength = 0;
    var linePointPositions = [];
    var currX, currY;
    for (var i = 0; i < segs.length; ++i) {
        var seg = segs[i];
        if (seg.x !== undefined)
            currX = seg.x;
        if (seg.y !== undefined)
            currY = seg.y;

        var transformedPt = transformedPoint(currX, currY, node);
        linePointPositions.push({
            x: transformedPt.x,
            y: transformedPt.y
        });

        lineLength++;
    }

    if (dataArray && dataArray.length === lineLength) {
        var schema = [];
        if (dataArray[0] instanceof Object) {
            schema = schema.concat(_.keys(dataArray[0]));
        }
        else {
            schema = schema.concat(typeof dataArray[0]);
        }
        schema = schema.concat(_.keys(otherAttrs));
        var lineData = [];
        var lineAttrs = [];
        var lineIDs = [];
        var lineNodeAttrs = [];
        var lineCount = 0;

        for (var j = 0; j < dataArray.length; ++j) {
            var dataRow = {};
            if (dataArray[0] instanceof Object) {
                dataRow = _.extend(dataRow, dataArray[j]);
            }
            else {
                var dataType = typeof dataRow[0];
                dataRow = {dataType: dataArray[j]};
            }
            dataRow = _.extend(dataRow, otherAttrs);
            dataRow['lineID'] = lineCount;
            lineCount++;
            lineData[j] = dataRow;
            lineAttrs[j] = attrs;
            lineAttrs[j].xPosition = linePointPositions[j].x;
            lineAttrs[j].yPosition = linePointPositions[j].y;
            lineIDs.push(id);
            lineNodeAttrs.push(nodeAttrs);
        }

        _.each(segs, function(seg, ind) {
            var svg = node.ownerSVGElement;
            var transform = node.getTransformToElement(svg);
            var pt = svg.createSVGPoint();
            pt.x = seg.x;
            pt.y = seg.y;
            pt = pt.matrixTransform(transform);
            lineAttrs[ind]['xPosition'] = pt.x;
            lineAttrs[ind]['yPosition'] = pt.y;
        });

        return {
            schema: schema,
            ids: lineIDs,
            data: lineData,
            attrs: lineAttrs,
            nodeAttrs: lineNodeAttrs,
            isLine: true
        }
    }

    return null;

}

/**
 * Groups nodes by 'schema', the data type or set of data types contained in their D3-bound data.
 * @returns {Array} - Array of schemas, each containing a list of information about mark-generating SVG nodes
 * @param data
 * @param ids
 * @param attrs
 */
function schematize (data, ids, nodeInfo) {
    var dataSchemas = [];
    var attrs = nodeInfo.attrData;
    var nodeAttrs = nodeInfo.nodeAttrs;

    for (var i = 0; i < data.length; ++i) {

        var line = checkLine(data[i], nodeInfo.attrData[i],
            nodeInfo.nodeAttrs[i], nodeInfo.nodes[i], ids[i]);
        if (line) {
            Array.prototype.push.apply(data, line.data);
            Array.prototype.push.apply(ids, line.ids);
            Array.prototype.push.apply(nodeInfo.attrData, line.attrs);
            Array.prototype.push.apply(nodeInfo.nodeAttrs, line.nodeAttrs);
            _.each(line.ids, function(id, ind) {
                nodeInfo.nodes.push(nodeInfo.nodes[ind]);
            });
            continue;
        }


//        if (typeof data[i] === "object") {
//            data[i] = flattenObject(data[i]);
//        }
        var currSchema = _.keys(data[i]);

        var foundSchema = false;
        for (var j = 0; j < dataSchemas.length; ++j) {
            if (_.intersection(currSchema,dataSchemas[j].schema).length == currSchema.length
                && !dataSchemas[j].isLine
                && dataSchemas[j].nodeType === nodeInfo.attrData[i]['shape']) {
                foundSchema = true;
                dataSchemas[j].ids.push(ids[i]);
                dataSchemas[j].nodeAttrs.push(nodeAttrs[i]);

                // Not using _.each for this because there could be "length" data which
                // would break underscore's ducktyping
                for (var dataAttr in data[i]) {
                    if (data[i].hasOwnProperty(dataAttr)) {
                        dataSchemas[j].data[dataAttr].push(data[i][dataAttr]);
                    }
                }

                _.each(attrs[i], function(val, attr) {
                    dataSchemas[j].attrs[attr].push(val);
                });
                break;
            }
        }

        if (!foundSchema) {
            var newSchema = {
                schema: currSchema,
                nodeType: nodeInfo.attrData[i]['shape'],
                ids: [ids[i]],
                data: {},
                attrs: {},
                nodeAttrs: [nodeAttrs[i]],
                isLine: nodeInfo.attrData[i]['shape'] === 'linePoint'
            };

            for (var dataAttr in data[i]) {
                if (data[i].hasOwnProperty(dataAttr)) {
                    newSchema.data[dataAttr] = [data[i][dataAttr]];
                }
            }

            _.each(attrs[i], function(val, attr) {
                newSchema.attrs[attr] = [val];
            });

            dataSchemas.push(newSchema);
        }
    }

    return dataSchemas;
}

var getAxis = function(axisGroupNode) {
    var axisTickLines = $(axisGroupNode).find('line');
    var axisTickLabels = $(axisGroupNode).find('text');
    var subdivide = axisTickLabels.length < axisTickLines.length;
    var tickCount = axisTickLines.length;
    var exampleTick = d3.select(axisTickLines[0]);
    var tickSize = +exampleTick.attr('x2') + (+exampleTick.attr('y2'));

    var axisOrient = +exampleTick.attr("x2") === 0 ? "horizontal" : "vertical";
    var exampleLabel = d3.select(axisTickLabels[0]);
    if (axisOrient === "horizontal") {
        axisOrient = +exampleLabel.attr("y") > 0 ? "bottom" : "top";
    }
    else {
        axisOrient = +exampleLabel.attr("x") > 0 ? "right" : "left";
    }

    if (axisOrient === "left" || axisOrient === "top") {
        tickSize = -tickSize;
    }

    return d3.svg.axis()
        .scale(axisGroupNode.__chart__)
        .tickSubdivide(subdivide)
        .ticks(tickCount)
        .tickSize(tickSize)
        .orient(axisOrient);
};

/**
 * Given a root SVG element, returns all of the mark generating SVG nodes
 * and their order in the DOM traversal ('id').
 * @param svgNode
 * @returns Array
 */
var extractMarkData = function(svgNode) {
    var svgChildren = $(svgNode).find('*');
    var marks = [];


    for (var i = 0; i < svgChildren.length; ++i) {
        var node = svgChildren[i];

        // Deal with axes, add data if they aren't data-bound.
        if (node.__chart__ && !node.__axis__) {
            var axis = getAxis(node);
            var labels = $(node).find("text");
            var labelData = {};
            $.each(labels, function(i, label) {
                labelData[label.__data__] = label.textContent;
            });

            d3.select(node).call(axis);

            var newLabels = $(node).find("text");
            $.each(labels, function(i, label) {
                d3.select(label).text(labelData[label.__data__]);
            });
        }

        // We've found a data-bound axis.  Now let's separate the axis from the remainder of the deconstruction.
        if (node.__axis__) {
            var axisOrientation = (node.__axis__.orient === "left" || node.__axis__.orient === "right") ? "yaxis" : "xaxis";
            var axisChildren = $(node).find('*');
            for (var j = 0; j < axisChildren.length; ++j) {
                var axisChild = axisChildren[j];
                axisChild.__axisMember__ = true;
                axisChild.__whichAxis__ = axisOrientation;
            }
        }

        var mark = extractMarkDataFromNode(node, i);
        if (mark)
            marks.push(mark);
    }

    fixTypes(_.map(marks, function(mark) {return mark.data;}));

    return marks;
};

var extractAxes = function(svgNode) {
    var svgChildren = $(svgNode).find('*');
    var axes = [];

    for (var i = 0; i < svgChildren.length; ++i) {
        var node = svgChildren[i];

        // Deal with axes, add data if they aren't data-bound.
        if (node.__chart__ && !node.__axis__) {
            var axis = getAxis(node);
            var labels = $(node).find("text");
            var labelData = {};
            $.each(labels, function (i, label) {
                labelData[label.__data__] = label.textContent;
            });

            d3.select(node).call(axis);

            var newLabels = $(node).find("text");
            $.each(labels, function (i, label) {
                d3.select(label).text(labelData[label.__data__]);
            });
        }

        // We've found a data-bound axis.  Now let's separate the axis from the remainder of the deconstruction.
        if (node.__axis__) {
            var axisOrientation = (node.__axis__.orient === "left" || node.__axis__.orient === "right") ? "yaxis" : "xaxis";
            node.__axis__.axis = axisOrientation;
            node.__axis__.scaleDomain = _.clone(node.__chart__.domain());

            var axisBoundingBox = transformedBoundingBox(node);
            var localScaleRange = node.__chart__.range();
            var axisTransform = node.getTransformToElement(node.ownerSVGElement);
            var axisZero = node.ownerSVGElement.createSVGPoint().matrixTransform(axisTransform);
            node.__axis__.offset = {
                x: axisZero.x,
                y: axisZero.y
            };

            if (localScaleRange.length > 2) {
                var axisOffset = axisOrientation === "xaxis" ? axisZero.x : axisZero.y;
                node.__axis__.scaleRange = _.map(localScaleRange, function(rangeVal) { return rangeVal + axisOffset; });
            }
            else if (axisOrientation === "xaxis") {
                node.__axis__.scaleRange = [localScaleRange[0] + axisZero.x, localScaleRange[1] + axisZero.x];
            }
            else if (axisOrientation === "yaxis") {
                node.__axis__.scaleRange = [localScaleRange[0] + axisZero.y, localScaleRange[1] + axisZero.y];
            }

            node.__axis__.boundingBox = axisBoundingBox;
            axes.push(node.__axis__);
        }
    }
    return axes;
};

var extractMarkDataFromNode = function(node, deconID) {
    /** List of tag names which generate marks in SVG and are accepted by our system. **/
    var markGeneratingTags = ["circle", "ellipse", "rect", "path", "polygon", "text", "line"];
    var isMarkGenerating = _.contains(markGeneratingTags, node.tagName.toLowerCase());
    if (isMarkGenerating) {
        var mark = {
            deconID: deconID,
            node: node,
            attrs: extractAttrsFromMark(node),
            nodeAttrs: extractNodeAttrsFromMark(node)
        };

        if (node.__axisMember__) {
            mark.axis = node.__whichAxis__;
        }

        // Extract data for marks that have data bound
        var data = node.__data__;

        if (data !== undefined) {
            if (typeof data === "object") {
                data = $.extend({}, data);
            }
            else if (typeof data === "number") {
                data = {number: data};
            }
            else {
                data = {string: data};
            }
        }
        //
        //if (node.tagName.toLowerCase() === "text" && data) {
        //    data.text = $(node).text();
        //}

        if (data !== undefined) {
            mark.data = data;
        }
    }

    return mark;
};

var extractAttrsFromMark = function(mark) {
    var attrs = extractStyle(mark);
    attrs.shape = mark.tagName;
    var boundingBox = transformedBoundingBox(mark);

    attrs.xPosition = boundingBox.x + (boundingBox.width / 2);
    attrs.yPosition = boundingBox.y + (boundingBox.height / 2);

    attrs.area = boundingBox.width * boundingBox.height;
    attrs.width = boundingBox.width;
    attrs.height = boundingBox.height;

    if (mark.tagName === "text") {
        attrs.text = $(mark).text();
    }
    else {
        attrs.text = "";
    }

    // TODO: FIXME
    attrs.rotation = 0;

    return fixTypes([attrs])[0];
};

/**
 * Extracts the style and positional properties for each of a list of nodes, placing each node's in
 * attributes in a Javascript object.
 * @param nodes
 * @returns {Array}
 */
function extractVisAttrs (nodes) {
    var visAttrData = [];

    for (var i = 0; i < nodes.length; ++i) {
        var node = nodes[i];
        var style = extractStyle(node);
        style.shape = node.tagName;

        var boundingBox = transformedBoundingBox(node);
        style.xPosition = boundingBox.x + (boundingBox.width / 2);
        style.yPosition = boundingBox.y + (boundingBox.height / 2);

        style.area = boundingBox.width * boundingBox.height;
        style.width = boundingBox.width;
        style.height = boundingBox.height;

        style.rotation = 0;

        visAttrData.push(style);
    }
    visAttrData = fixTypes(visAttrData);
    return visAttrData;
}

var extractNodeAttrsFromMark = function(markNode) {
    var attrData = {};
    for (var i = 0; i < markNode.attributes.length; ++i) {
        var attr = markNode.attributes[i];
        attrData[attr.name] = attr.value;
    }
    attrData.text = $(markNode).text();
    return attrData;
};

/**
 * All style and some data attributes are extracted as strings, though some are number data or
 * colors, a more complex type in reality.  This function parses those types and
 * replaces the strings with the appropriate data types.
 * @param objArray - Array of objects
 * @returns {*} - objArray object with updated data types
 */
function fixTypes (objArray) {

    var fieldType = {};
    var rgbRegex = /^rgb\((\d{1,3}),\s*(\d{1,3}),\s*(\d{1,3})\)$/;
    var object, property, rgbChannels;

    // Find the most specific type for each style attribute
    for (var i = 0; i < objArray.length; ++i) {
        object = objArray[i];
        if (typeof object !== "object") {
            continue;
        }

        for (property in object) {
            if (object.hasOwnProperty(property)) {
                if (object[property] instanceof Date) {
                    object[property] = object[property].getTime();
                }

                rgbChannels = rgbRegex.exec(object[property]);
                // If this is our first pass, set it to whatever we see
                if (!fieldType.hasOwnProperty(property)) {
                    if (!isNaN(+object[property]) && property !== "text") {
                        // This is a number
                        fieldType[property] = "number";
                    }
                    else if (rgbChannels) {
                        fieldType[property] = "color";
                    }
                    else {
                        fieldType[property] = "string";
                    }
                }
                // In the future, generalize to string if not all match number/color
                else {
                    if (fieldType[property] === "number" && isNaN(+object[property])) {
                        fieldType[property] = "string";
                    }
                    else if (fieldType[property] === "color" && !rgbChannels) {
                        fieldType[property] = "string";
                    }
                }
            }
        }
    }

    // Now based on the types found we need to change the JS datatypes as necessary
    for (var j = 0; j < objArray.length; ++j) {
        object = objArray[j];
        for (var attr in object) {
            if (object.hasOwnProperty(attr)) {
                if (fieldType[attr] === "number") {
                    object[attr] = +object[attr];
                }
                else if (fieldType[attr] === "color") {
                    rgbChannels = rgbRegex.exec(object[attr]);
                    /*
                     object[attr] = {
                     r: parseFloat(rgbChannels[1]),
                     g: parseFloat(rgbChannels[2]),
                     b: parseFloat(rgbChannels[3])
                     }
                     */
                    object[attr] = "rgb(" + rgbChannels[1] + "," + rgbChannels[2] + "," + rgbChannels[3] + ")";
                }
            }
        }
    }


    return objArray;
}

/**
 * Finds the CSS style properties for a DOM node.
 * @param domNode
 * @returns {{}}
 */
function extractStyle (domNode) {
    var style = window.getComputedStyle(domNode, null);
    var styleObject = {};

    for (var i = 0; i < style.length; ++i) {
        var prop = style[i];
        styleObject[prop] = style.getPropertyValue(prop);
    }

    // A little hack since SVG's default is to scale the stroke-width
    styleObject["vector-effect"] = "non-scaling-stroke";

    var filterAttrs = [
        "stroke",
        "fill",
        "font-family",
        "font-weight",
        "font-size",
        "stroke-width",
        "opacity",
        "fill-opacity"
    ];
    var filteredStyleObject = {};
    _.each(styleObject, function(val, key) {
        if (_.contains(filterAttrs, key)) {
            filteredStyleObject[key] = val;
        }
    });

    return filteredStyleObject;
}

function transformedBoundingBox(el, to) {
    var bb = el.getBBox();
    var svg = el.ownerSVGElement;
    if (!to) {
        to = svg;
    }
    var m = el.getTransformToElement(to);
    var pts = [svg.createSVGPoint(), svg.createSVGPoint(), svg.createSVGPoint(), svg.createSVGPoint()];
    pts[0].x = bb.x;
    pts[0].y = bb.y;
    pts[1].x = bb.x + bb.width;
    pts[1].y = bb.y;
    pts[2].x = bb.x + bb.width;
    pts[2].y = bb.y + bb.height;
    pts[3].x = bb.x;
    pts[3].y = bb.y + bb.height;

    var xMin = Infinity;
    var xMax = -Infinity;
    var yMin = Infinity;
    var yMax = -Infinity;

    for (var i = 0; i < pts.length; i++) {
        var pt = pts[i];
        pt = pt.matrixTransform(m);
        xMin = Math.min(xMin, pt.x);
        xMax = Math.max(xMax, pt.x);
        yMin = Math.min(yMin, pt.y);
        yMax = Math.max(yMax, pt.y);
    }
    bb.x = xMin;
    bb.width = xMax - xMin;
    bb.y = yMin;
    bb.height = yMax - yMin;
    return bb;
}

var transformedPoint = function(ptX, ptY, ptBaseElem, ptTargetElem) {
    var svg = ptBaseElem.ownerSVGElement;
    if (!ptTargetElem) {
        ptTargetElem = svg;
    }

    var m = ptBaseElem.getTransformToElement(ptTargetElem);
    var transformedPt = svg.createSVGPoint();
    transformedPt.x = ptX;
    transformedPt.y = ptY;
    return transformedPt.matrixTransform(m);
};

module.exports = {
    pageDeconstruct: pageDeconstruct,
    deconstruct: deconstruct,
    extractNodeAttrs: extractNodeAttrs,
    extractMappings: extractMappings,
    extractMultiLinearMappings: extractMultiLinearMappings,
    schematize: schematize,
    extractData: extractMarkData,
    extractVisAttrs: extractVisAttrs,
    extractStyle: extractStyle,
    isDerived: isDerived
};