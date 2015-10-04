var _ = require('underscore');
var Mapping = require('./Mapping');
var Deconstruct = require('./Deconstruct.js');
var Deconstruction = require('./Deconstruction.js');

function MarkGroup(data, attrs, nodeAttrs, ids, mappings, name, svg, axis) {
    this.data = data;
    this.attrs = attrs;

    var columnData = [];
    _.each(data, function(val, key) {
        columnData.push({
            name: key,
            data: val
        });
    });
    _.each(attrs, function(val, key) {
        columnData.push({
            name: key,
            data: val
        });
    });

    this.numFields = Object.keys(data).length;
    this.ids = ids;

    this.mappings = _.map(mappings, function(mapping) {
        return new Mapping(mapping.data, mapping.attr, mapping.type, mapping.params, mapping.dataRange, mapping.attrRange);
    });
    this.nodeAttrs = nodeAttrs;
    this.name = name;
    this.svg = svg;
    this.axis = axis;
}

MarkGroup.prototype.attrIsMapped = function(attr) {
    return _.find(this.mappings, function(mapping) {
            return mapping.attr == attr;
        }) !== undefined;
};

MarkGroup.prototype.addGroup = function(otherGroup) {
    var me = this;

    for (var i = 0; i < otherGroup.ids.length; ++i) {
        this.ids.push(otherGroup.ids[i]);
        this.nodeAttrs.push(otherGroup.nodeAttrs[i]);

        var attrs = _.keys(otherGroup.attrs);
        var dataFields = _.keys(otherGroup.data);
        _.each(attrs, function(attr) {
            me.attrs[attr].push(otherGroup.attrs[attr][i]);
        });
        _.each(dataFields, function(dataField) {
            me.data[dataField].push(otherGroup.data[dataField][i]);
        });
    }
};

MarkGroup.prototype.uniqVals = function(fieldName, isAttr) {
    var allVals;
    if (isAttr) {
        allVals = this.attrs[fieldName];
    }
    else {
        allVals = this.data[fieldName];
    }
    return _.uniq(allVals);
};

MarkGroup.prototype.updateAttrsFromMappings = function() {
    var schema = this;
    var mappedAttrs = _.map(schema.mappings, function (mapping) {
        return mapping.attr;
    });
    _.each(schema.mappings, function(mapping) {
        var data = schema.data;
        var attrs = schema.attrs;

        if (mapping.type === "nominal") {
            for (var i = 0; i < data[mapping.data].length; ++i) {
                attrs[mapping.attr][i] = mapping.params[data[mapping.data][i]];
            }
        }
        else {
            for (var j = 0; j < data[mapping.data[0]].length; ++j) {
                var dataVal = data[mapping.data[0]][j];
                attrs[mapping.attr][j] = dataVal * mapping.params.coeffs[0] + mapping.params.coeffs[1];

                if (mapping.attr === "area") {
                    attrs["width"][j] = Math.sqrt(+dataVal * mapping.params.coeffs[0] + mapping.params.coeffs[1]);
                    attrs["height"][j] = Math.sqrt(+dataVal * mapping.params.coeffs[0] + mapping.params.coeffs[1]);
                }
            }
        }
    });
};

MarkGroup.prototype.updateMarks = function(val, attr, ids) {
    var schema = this;
    _.each(ids, function(id) {
        var ind = _.find(schema.ids[id]);
        schema.attrs[attr][ind] = val;

        if (attr === "area") {
            schema.attrs["width"] = Math.sqrt(val);
        }
        else if (attr === "width" || attr === "height") {
            schema.attrs["area"] = schema.attrs["width"][ind]
            * schema.attrs["height"][ind];
        }
    });
};

MarkGroup.prototype.getMarkBoundingBox = function() {
    var xMin = Number.MAX_VALUE;
    var xMax = Number.MIN_VALUE;
    var yMin = Number.MAX_VALUE;
    var yMax = Number.MIN_VALUE;

    for (var i = 0; i < this.attrs["xPosition"].length; ++i) {
        var markMinX = this.attrs["xPosition"][i] - this.attrs["width"][i] / 2;
        var markMinY = this.attrs["yPosition"][i] - this.attrs["height"][i] / 2;
        var markMaxX = this.attrs["xPosition"][i] + this.attrs["width"][i] / 2;
        var markMaxY = this.attrs["yPosition"][i] + this.attrs["height"][i] / 2;

        if (this.data.hasOwnProperty("lineID")) {
            markMinX = this.attrs["xPosition"][i];
            markMinY = this.attrs["yPosition"][i];
            markMaxX = this.attrs["xPosition"][i];
            markMaxY = this.attrs["yPosition"][i];
        }

        if (markMinX < xMin) {
            xMin = markMinX;
        }
        if (markMinY < yMin) {
            yMin = markMinY;
        }
        if (markMaxX > xMax) {
            xMax = markMaxX;
        }
        if (markMaxY > yMax) {
            yMax = markMaxY;
        }
    }

    return {
        x: xMin,
        y: yMin,
        width: xMax - xMin,
        height: yMax - yMin
    };
};

MarkGroup.fromJSON = function(deconData) {
    var schema = new MarkGroup(
        deconData.data,
        deconData.attrs,
        deconData.nodeAttrs,
        deconData.ids,
        deconData.mappings,
        deconData.name,
        deconData.svg,
        deconData.axis
    );

    return schema;
};

MarkGroup.prototype.getMappingForAttr = function(attr) {
    for (var i = 0; i < this.mappings.length; ++i) {
        var mapping = this.mappings[i];
        if (mapping.attr === attr) {
            return mapping;
        }
    }
    return null;
};

MarkGroup.prototype.getMappingsForAttr = function(attr) {
    var mappings = [];
    for (var i = 0; i < this.mappings.length; ++i) {
        var mapping = this.mappings[i];
        if (mapping.attr === attr) {
            mappings.push(mapping);
        }
    }
    if (mappings.length === 0) {
        return undefined;
    }

    return mappings;
};

MarkGroup.prototype.getNonDerivedMappingsForAttr = function(attr) {
    var mappings = this.getMappingsForAttr(attr);
    _.filter(mappings, function(mapping) {
        return !_.contains(mapping.data, "deconID") && !_.contains(mapping.data, "lineID");
    });
    return mappings;
};

MarkGroup.prototype.addData = function(data) {
    var mg = this;

    var dataFields = _.keys(this.data);
    var attrs = _.keys(this.attrs);

    if (_.difference(_.keys(data), dataFields).length !== 0) {
        return undefined;
    }
    else {
        dataFields.forEach(function(field) {
            mg.data[field].push(data[field]);
        });
        attrs.forEach(function(attr) {
            mg.attrs[attr].push(mg.attrs[attr][0]);
        });
        this.nodeAttrs.push(_.clone(this.nodeAttrs[0]));
        this.ids.push(_.max(this.ids) + 1);
    }
};

MarkGroup.prototype.addMarksForData = function() {
    var mg = this;

    var dataFields = _.keys(this.data);
    var someDataField = dataFields[0];
    var dataLength = this.data[someDataField].length;
    var attrNames = _.keys(this.attrs);
    while (this.ids.length < dataLength) {
        attrNames.forEach(function(attrName) {
            mg.attrs[attrName].push(mg.attrs[attrName][0]);
        });
        this.nodeAttrs.push(_.clone(this.nodeAttrs[0]));
        this.ids.push(_.max(this.ids) + 1);
    }
    if (this.ids.length > dataLength) {
        attrNames.forEach(function(attrName) {
            mg.attrs[attrName].splice(dataLength);
            mg.nodeAttrs.splice(dataLength);
            mg.ids.splice(dataLength);
        });
    }
};

MarkGroup.prototype.getNewMappings = function() {
    this.mappings = Deconstruct.extractMappings(this);
};

MarkGroup.prototype.updateUnmapped = function() {
    var me = this;
    var attrs = _.keys(this.attrs);
    var unmappedAttrs = _.difference(attrs, _.map(this.mappings, function(mapping) { return mapping.attr; }));
    if (_.contains(attrs, "area")) {
        unmappedAttrs = _.difference(unmappedAttrs, ["width", "height"]);
    }

    unmappedAttrs.forEach(function(unmappedAttr) {
        var attrVals = me.attrs[unmappedAttr];
        if (typeof attrVals[0] === 'number') {
            var attrSum = _.reduce(attrVals, function(x, y) {return x+y;});
            var avg = attrSum / attrVals.length;
            me.attrs[unmappedAttr] = _.map(attrVals, function() {return avg;});
        }
        else {
            var counts = _.countBy(attrVals, function(attrVal) {return attrVal;});
            var maxCount = -1;
            var maxCountVal = undefined;
            _.each(counts, function(count, val) {
                if (count > maxCount) {
                    maxCount = count;
                    maxCountVal = val;
                }
            });
            me.attrs[unmappedAttr] = _.map(attrVals, function() {return maxCountVal;});
        }
    });
};

MarkGroup.prototype.resetNonMapped = function() {
    var mg = this;
    var mappedAttrs = _.map(this.mappings, function(mapping) { return mapping.attr; });
    mappedAttrs = _.uniq(mappedAttrs);
    var allAttrs = _.keys(this.attrs);

    _.each(allAttrs, function(attr) {
        if (!_.contains(mappedAttrs, attr)) {
            for (var i = 0; i < mg.attrs[attr].length; ++i) {
                mg.attrs[attr][i] = mg.attrs[attr][0];
            }
        }
    });
};

MarkGroup.prototype.removeLastDataRow = function() {
    var mg = this;
    var dataFields = _.keys(this.data);
    var attrs = _.keys(this.attrs);

    dataFields.forEach(function(field) {
        mg.data[field].splice(mg.data[field].length-1);
    });
    attrs.forEach(function(attr) {
        mg.attrs[attr].splice(mg.attrs[attr].length-1);
    });
    this.nodeAttrs.splice(this.nodeAttrs.length-1);
    this.ids.splice(this.ids.length-1);
};

MarkGroup.prototype.getAttrRange = function(attr) {
    var min = _.min(this.attrs[attr]);
    var max = _.max(this.attrs[attr]);
    return [min, max];
};

MarkGroup.prototype.getDataRange = function(data) {
    var min = _.min(this.data[data]);
    var max = _.max(this.data[data]);
    return [min, max];
};

MarkGroup.prototype.getMapping = function(data, attr) {
    for (var i = 0; i < this.mappings.length; ++i) {
        var thisMappingData = this.mappings[i].type === "linear" ? this.mappings[i].data[0] : this.mappings[i].data;
        if (thisMappingData === data && this.mappings[i].attr === attr) {
            return this.mappings[i];
        }
    }
    return null;
};

MarkGroup.prototype.getDataCSVBlob = function() {
    var keys = Object.keys(this.data);
    console.log(keys);
    var dataLen = this.data[keys[0]].length;
    var dataRows = [];

    dataRows.push(keys.join(","));

    for (var i = 0; i < dataLen; ++i) {
        var dataRow = [];
        for (var j = 0; j < keys.length; ++j) {
            var dataVal = this.data[keys[j]][i];
            if (typeof dataVal === "string") {
                dataRow.push(dataVal.replace(",", ""));
            }
            else {
                dataRow.push(dataVal);
            }
        }
        console.log(dataRow);
        dataRow = dataRow.join(",");
        dataRows.push(dataRow);
    }

    dataRows = dataRows.join("\n");

    return dataRows;
};

MarkGroup.getBoundingBoxFromGroups = function(groups) {
    var decon = new Deconstruction({x: 0, y: 0, width: 0, height: 0}, groups);
    decon.svg = decon.getMarkBoundingBox({x: 0, y: 0, width: 0, height: 0});
    return decon.svg;
};

module.exports = MarkGroup;