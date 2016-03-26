"use strict";

var assert = require('assert');
var _ = require('underscore');

class Mapping {
    constructor(dataField, attr, params, dataRange, attrRange) {
        this.type = "unknown";
        this.newStyleMappings = true;

        this.dataField = dataField;
        this.attr = attr;
        this.params = params;
        this.dataRange = dataRange;
        this.attrRange = attrRange;
    }

    getData() {
        return this.dataField;
    }

    static fromJSON(json) {
        json = _.clone(json);
        if (json.type === "nominal") {
            return NominalMapping.fromJSON(json);
        }
        else if (json.newStyleMappings && json.type === "linear") {
            return LinearMapping.fromJSON(json);
        }
        else if (json.newStyleMappings && json.type === "derived") {
            return DerivedMapping.fromJSON(json);
        }
        else if (json.type === "linear" &&
            json.hasOwnProperty('params') &&
            json.params.hasOwnProperty('coeffs') &&
            json.params.coeffs.length === 2) {
            return new LinearMapping(
                json.data[0],
                json.attr,
                json.params.coeffs,
                json.dataRange,
                json.attrRange
            )
        }
        else if (json.type === "derived" &&
            json.hasOwnProperty('params') &&
            json.params.hasOwnProperty('coeffs') &&
            json.params.coeffs.length === 2) {
            return new DerivedMapping(
                json.data[0],
                json.attr,
                json.params.coeffs,
                json.dataRange,
                json.attrRange
            )
        }

        console.log(json);
        throw "Failed to match with a mapping type.";
    }
}

class NominalMapping extends Mapping {
    constructor(dataField, attr, params) {
        super(dataField, attr, params, _.keys(params), _.values(params));
        this.type = "nominal";

        this.dataField = dataField;
        this.attr = attr;
        this.params = params;
    }

    map(val) {
        return this.params[val];
    }

    invert(attrVal) {
        for(var dataKey in this.params) {
            if(this.params.hasOwnProperty(dataKey) && this[dataKey] === attrVal) {
                return dataKey;
            }
        }
    }

    isEqualTo(otherMapping) {
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

    static fromJSON(json) {
        json = _.clone(json);
        return new NominalMapping(
            json.dataField ? json.dataField : json.data,
            json.attr,
            json.params
        );
    }
}

class LinearMapping extends Mapping {
    constructor(dataField, attr, coeffs, dataRange, attrRange) {
        super(dataField, attr, _.clone(coeffs), dataRange, attrRange);
        this.type = "linear";
    }

    get coeffs() {
        return this.params;
    }

    set coeffs(newCoeffs) {
        this.params = _.clone(newCoeffs);
    }

    isEqualTo(otherMapping) {
        if (this.coeffs.length !== otherMapping.coeffs.length) {
            return false;
        }

        for (var i = 0; i < this.coeffs.length; ++i) {
            var thisParam = this.coeffs[i];
            var otherParam = otherMapping.coeffs[i];
            if (thisParam > otherParam + 1.5 || thisParam < otherParam - 1.5) {
                return false;
            }
        }
        return true;
    }

    map(val) {
        return val * this.coeffs[0] + this.coeffs[1];
    }

    invert(attrVal) {
        return (attrVal - this.coeffs[1]) / this.coeffs[0];
    }

    linearRelationshipTo(otherMapping) {
        assert(otherMapping instanceof LinearMapping);

        var a = this.coeffs[0];
        var b = this.coeffs[1];
        var x = otherMapping.coeffs[0];
        var y = otherMapping.coeffs[1];

        var relCoeff1 = x / a;
        var relCoeff2 = y - ((b * x) / a);
        return [relCoeff1, relCoeff2];
    }

    getZeroVal() {
        return (-this.coeffs[1]) / this.coeffs[0];
    }

    static fromJSON(json) {
        json = _.clone(json);
        return new LinearMapping(
            json.dataField,
            json.attr,
            json.coeffs,
            json.dataRange,
            json.attrRange
        )
    }
}

class DerivedMapping extends LinearMapping {
    constructor(dataField, attr, coeffs, dataRange, attrRange) {
        super(dataField, attr, coeffs, dataRange, attrRange);

        this.type = "derived";
    }
}

class MultiLinearMapping extends Mapping {
    constructor(dataFields, attr, coeffs, dataRange, attrRange) {
        super(dataFields, attr, coeffs, dataRange, attrRange);
        this.dataFields = dataFields;
    }
}

module.exports = {
    Mapping,
    NominalMapping,
    LinearMapping,
    MultiLinearMapping,
    DerivedMapping
};