var _ = require('underscore');
var MarkGroup = require('./MarkGroup');

var Deconstruction = function(svg, groups, unbound, axes) {
    var groupData = [];
    groups.forEach(function(group) {
        groupData.push(MarkGroup.fromJSON(group));
    });

    this.groups = groupData;
    this.svg = svg;
    this.unbound = unbound;
    this.axes = axes;
};

Deconstruction.fromJSON = function(json) {
    return new Deconstruction(json.svg, json.groups, json.unbound, json.axes);
};

Deconstruction.prototype.getGroupByName = function(name) {
    var foundGroup = null;
    _.each(this.groups, function(group) {
        if(group.name === name) {
            foundGroup = group;
        }
    });
    return foundGroup;
};

Deconstruction.prototype.getAllMappingsForAttr = function(attr) {
    var mappings = [];
    _.each(this.groups, function(group) {
        var attrMaps = group.getNonDerivedMappingsForAttr(attr);
        _.each(attrMaps, function(mapping) {
            mapping.group = group;
            mappings.push(mapping);
        });
    });
    return mappings;
};

module.exports = Deconstruction;