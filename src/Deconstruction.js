var _ = require('lodash');
var MarkGroup = require('./MarkGroup');

var Deconstruction = function(svg, groups, unbound, axes, mappingSets) {
    var groupData = [];
    groups.forEach(function(group) {
        groupData.push(MarkGroup.fromJSON(group));
    });

    this.groups = groupData;
    this.svg = svg;
    this.unbound = unbound;
    this.axes = axes;
    this.mappingSets = mappingSets;
    if (mappingSets) {
        this.updateMappingSetsWithMappings();
    }
};

Deconstruction.fromJSON = function(json) {
    return new Deconstruction(json.svg, json.groups, json.unbound, json.axes, json.mappingSets);
};

Deconstruction.prototype.updateMappingSetsWithMappings = function() {
    var thisDecon = this;
    for (var attr in this.mappingSets) {
        var attrMappingSets = this.mappingSets[attr];
        for (var i = 0; i < attrMappingSets.length; ++i) {
            var mappingSet = attrMappingSets[i];
            var mappingRefs = mappingSet.mappingRefs;
            var mappingObjs = [];
            mappingRefs.forEach(function (mappingRef) {
                var mappingForRef = thisDecon.groups[mappingRef.groupID].getMapping(mappingRef.data, mappingRef.attr);
                mappingForRef.group = thisDecon.groups[mappingRef.groupID];
                mappingObjs.push(mappingForRef);
            });
            mappingSet.mappings = mappingObjs;
        }
    }
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

Deconstruction.prototype.getMarkBoundingBox = function(svg) {
    var unionBoundingBox = svg;
    unionBoundingBox.x = 0;
    unionBoundingBox.y = 0;

    this.groups.forEach(function(group) {
        groupBox = group.getMarkBoundingBox();
        if (groupBox.x + groupBox.width > unionBoundingBox.width) {
            unionBoundingBox.width = groupBox.x + groupBox.width;
        }
        if (groupBox.y + groupBox.height > unionBoundingBox.height) {
            unionBoundingBox.height = groupBox.y + groupBox.height;
        }
    });
    return unionBoundingBox;
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