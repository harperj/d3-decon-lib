var _ = require('underscore');

var Deconstruction = function(svg, schemas) {
    var schemaData = [];
    schemas.forEach(function(schema) {
        schemaData.push(MarkGroup.fromJSON(schema));
    });

    this.schemaData = schemaData;
    this.svg = svg;
};

Deconstruction.fromJSON = function(json) {
    return new Deconstruction(json.svg, json.marks);
};

Deconstruction.prototype.getSchemaByName = function(name) {
    var foundSchema = null;
    _.each(this.schemaData, function(schema) {
        if(schema.name === name) {
            foundSchema = schema;
        }
    });
    return foundSchema;
};

module.exports = Deconstruction;