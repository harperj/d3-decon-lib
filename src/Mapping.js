var assert = require('assert');

function Mapping(data_field_name, attr_name, mapping_type, params, dataRange, attrRange) {
    this.data = data_field_name;
    this.attr = attr_name;
    this.type = mapping_type;
    this.params = params;
    this.dataRange = dataRange;
    this.attrRange = attrRange;
}

Mapping.fromJSON = function(json) {
    return new Mapping(
        json.data,
        json.attr,
        json.type,
        json.params,
        json.dataRange,
        json.attrRange
    );
};

Mapping.prototype.dataFromAttr = function(attrVal) {
    // TODO: Fix the multivariate case
    if (this.type === "linear") {
        return (attrVal - this.params.coeffs[1]) / this.params.coeffs[0];
    }
    else if (this.type === "nominal") {
        var params = this.params;
        for (var dataVal in params) {
            if (params.hasOwnProperty(dataVal)) {
                if (params[dataVal] === attrVal) {
                    return dataVal;
                }
            }
        }

        return undefined;
    }
};

Mapping.prototype.getData = function() {
    if (this.type === "linear" || this.type === "derived") {
        return this.data[0];
    }
    return this.data;
};

Mapping.prototype.isEqualTo = function(otherMapping) {
    if (this.type === "linear" && otherMapping.type === "linear") {
        if (this.params.coeffs.length !== otherMapping.params.coeffs.length) {
            return false;
        }

        for (var i = 0; i < this.params.coeffs.length; ++i) {
            var thisParam = this.params.coeffs[i];
            var otherParam = otherMapping.params.coeffs[i];
            if (thisParam > otherParam + 1.5 || thisParam < otherParam - 1.5) {
                return false;
            }
        }
        return true;
    }
    else if(this.type === "nominal" && otherMapping.type === "nominal") {
        for (var attr in this.params) {
            if (otherMapping.params.hasOwnProperty(attr)) {
                if (otherMapping.params[attr] !== this.params[attr]) {
                    return false;
                }
            }
            else {
                return false;
            }
        }
        return true;
    }
    return false;
};

Mapping.prototype.getZeroVal = function() {
    if (this.type !== "linear") {
        console.error("WRONG MAPPING TYPE");
        return null;
    }
    else {
        return (-this.params.coeffs[1]) / this.params.coeffs[0];
    }
};

Mapping.prototype.map = function(val) {
    if (this.type === "linear") {
        return val * this.params.coeffs[0] + this.params.coeffs[1];
    }
    else {
        return this.params[val];
    }
};

Mapping.prototype.linearRelationshipTo = function(otherMapping) {
    assert(this.type === "linear");
    assert(otherMapping.type === "linear");

    var a = this.params.coeffs[0];
    var b = this.params.coeffs[1];
    var x = otherMapping.params.coeffs[0];
    var y = otherMapping.params.coeffs[1];

    var relCoeff1 = x / a;
    var relCoeff2 = y - ((b * x) / a);
    return [relCoeff1, relCoeff2];
};

Mapping.prototype.invert = function(attrVal) {
    var dataVal;
    if (this.type = "linear") {
        return (attrVal - this.params.coeffs[1]) / this.params.coeffs[0];
    }
    else {
        for(var dataKey in this.params) {
            if(this.params.hasOwnProperty(dataKey) ) {
                if( this[dataKey] === attrVal)
                    return dataKey;
            }
        }
    }
};

module.exports = Mapping;