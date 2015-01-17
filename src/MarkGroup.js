var _ = require('underscore');
var Mapping = require('./Mapping');

function MarkGroup(data, attrs, nodeAttrs, ids, mappings, name) {
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
        return new Mapping(mapping.data, mapping.attr, mapping.type, mapping.params);
    });
    this.nodeAttrs = nodeAttrs;
    this.name = name;
}

MarkGroup.prototype.attrIsMapped = function(attr) {
    return _.find(this.mappings, function(mapping) {
        return mapping.attr == attr;
    }) !== undefined;
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

    var name = null;
    if (deconData.name) {
        name = deconData.name;
    }

    var schema = new MarkGroup(
        deconData.data,
        deconData.attrs,
        deconData.nodeAttrs,
        deconData.ids,
        deconData.mappings,
        name
    );
    schema.svg = deconData.svg;
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

MarkGroup.prototype.getMapping = function(data, attr) {
    for (var i = 0; i < this.mappings.length; ++i) {
        if (this.mappings[i].data[0] === data && this.mappings[i].attr === attr) {
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

module.exports = MarkGroup;