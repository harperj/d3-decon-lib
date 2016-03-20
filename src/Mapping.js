var assert = require('assert');

class Mapping {
    constructor(dataField, attr, params, dataRange, attrRange) {
        this.type = "unknown";

        this.dataField = dataField;
        this.attr = attr;
        this.params = params;
        this.dataRange = dataRange;
        this.attrRange = attrRange;
    }

    static fromJSON(json) {
        if (json.type === "nominal") {
            return NominalMapping.fromJSON(json);
        }
        else if (json.type === "linear" && json.hasOwnProperty('params') && json.params.coeffs.length === 2) {
            return LinearMapping(
                json.data,
                json.attr,
                json.params.coeffs,
                json.dataRange,
                json.attrRange
            )
        }
        else if (json.type === "linear" && json.hasOwnProperty('coeffs')) {
            return LinearMapping.fromJSON(json);
        }
    }
}

class NominalMapping extends Mapping {
    constructor(dataField, attr, params) {
        this.type = "nominal";

        this.dataField = dataField;
        this.attr = attr;
        this.params = params;

        super(dataField, attr, params, params.keys(), params.values());
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
        return new NominalMapping(
            json.dataField ? json.dataField : json.data,
            json.attr,
            json.params
        );
    }
}

class LinearMapping extends Mapping {
    constructor(dataField, attr, coeffs, dataRange, attrRange) {
        this.type = "linear";
        super(dataField, attr, coeffs, dataRange, attrRange);
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
        assert(otherMapping.type instanceof LinearMapping);

        var a = this.params.coeffs[0];
        var b = this.params.coeffs[1];
        var x = otherMapping.params.coeffs[0];
        var y = otherMapping.params.coeffs[1];

        var relCoeff1 = x / a;
        var relCoeff2 = y - ((b * x) / a);
        return [relCoeff1, relCoeff2];
    }

    getZeroVal() {
        return (-this.coeffs[1]) / this.coeffs[0];
    }

    static fromJSON(json) {
        return new LinearMapping(
            json.data,
            json.attr,
            json.type,
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
    MultiLinearMapping
};