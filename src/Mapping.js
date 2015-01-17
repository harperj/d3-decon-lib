/**
 * Created by harper on 11/25/14.
 */

function Mapping(data_field_name, attr_name, mapping_type, params) {
    this.data = data_field_name;
    this.attr = attr_name;
    this.type = mapping_type;
    this.params = params;
}

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
        return this.coeffs[val];
    }
};

module.exports = Mapping;