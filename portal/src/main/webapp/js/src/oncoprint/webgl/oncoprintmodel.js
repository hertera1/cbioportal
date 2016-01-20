function ifndef(x, val) {
    return (typeof x === "undefined" ? val : x);
}

var OncoprintModel = (function () {
    function OncoprintModel(init_cell_padding, init_cell_padding_on,
	    init_zoom, init_cell_width,
	    init_track_group_padding) {
		
	this.id_order = [];
	this.visible_id_order = [];
	
	
	this.id_to_index = {};
	
	this.hidden_ids = {};
	this.track_groups = [];
	this.track_group_sort_priority = [];
	
	this.zoom = ifndef(init_zoom, 1);

	this.cell_padding = ifndef(init_cell_padding, 10);
	this.cell_padding_on = ifndef(init_cell_padding_on, true);
	this.cell_width = ifndef(init_cell_width, 10);
	this.track_group_padding = ifndef(init_track_group_padding, 10);

	this.track_data = {};
	this.display_track_data = {}; // in order
	this.track_id_to_datum = {};
	
	this.track_rule_set = {};
	this.track_label = {};
	this.track_height = {};
	this.track_padding = {};
	this.track_data_id_key = {};
	this.track_tooltip_fn = {};
	this.track_removable = {};
	this.track_sort_cmp_fn = {};
	this.track_sort_direction_changeable = {};
    }

    OncoprintModel.prototype.toggleCellPadding = function () {
	this.cell_padding_on = !this.cell_padding_on;
	return this.cell_padding_on;
    }

    OncoprintModel.prototype.getCellPadding = function () {
	return (this.cell_padding * this.zoom) * (+this.cell_padding_on);
    }

    OncoprintModel.prototype.getZoom = function () {
	return this.zoom;
    }

    OncoprintModel.prototype.setZoom = function (z) {
	if (z <= 1 && z >= 0) {
	    this.zoom = z;
	}
	return this.zoom;
    }

    OncoprintModel.prototype.getCellWidth = function () {
	return this.cell_width * this.zoom;
    }

    OncoprintModel.prototype.getTrackHeight = function (track_id) {
	return this.track_height[track_id];
    }

    OncoprintModel.prototype.getTrackPadding = function (track_id) {
	return this.track_padding[track_id];
    }

    var computeIdIndex = function(model) {
	model.id_to_index = {};
	var id_order = model.getIdOrder(true);
	for (var i=0; i<id_order.length; i++) {
	    model.id_to_index[id_order[i]] = i;
	}
    }
    var computeVisibleIdOrder = function(model) {
	var hidden_ids = model.hidden_ids;
	model.visible_id_order = model.id_order.filter(function (id) {
	    return !hidden_ids[id];
	});
    }
    OncoprintModel.prototype.getIdOrder = function (all) {
	if (all) {
	    return this.id_order; // TODO: should be read-only
	} else {
	    return this.visible_id_order;
	}
    }

    OncoprintModel.prototype.getHiddenIds = function () {
	var hidden_ids = this.hidden_ids;
	return this.id_order.filter(function (id) {
	    return !!hidden_ids[id];
	});
    }

    OncoprintModel.prototype.setIdOrder = function (ids) {
	this.id_order = ids.slice();
	computeIdIndex(this);
	computeVisibleIdOrder(this);
	
	var track_ids = this.getTracks();
	for (var i=0; i<track_ids.length; i++) {
	    this.computeDisplayTrackData(track_ids[i]);
	}
    }

    OncoprintModel.prototype.hideIds = function (to_hide, show_others) {
	if (show_others) {
	    this.hidden_ids = {};
	}
	for (var j = 0, len = to_hide.length; j < len; j++) {
	    this.hidden_ids[to_hide[j]] = true;
	}
	computeVisibleIdOrder(this);
    }

    OncoprintModel.prototype.moveTrackGroup = function (from_index, to_index) {
	var new_groups = [];
	var group_to_move = this.track_groups[from_index];
	for (var i = 0; i < this.track_groups.length; i++) {
	    if (i !== from_index && i !== to_index) {
		new_groups.push(this.track_groups[i]);
	    }
	    if (i === to_index) {
		new_groups.push(group_to_move);
	    }
	}
	this.track_groups = new_groups;
	return this.track_groups;
    }

    OncoprintModel.prototype.addTracks = function (params_list) {
	for (var i = 0; i < params_list.length; i++) {
	    var params = params_list[i];
	    addTrack(this, params.track_id, params.target_group,
		    params.track_height, params.track_padding,
		    params.data_id_key, params.tooltipFn,
		    params.removable, params.label,
		    params.sortCmpFn, params.sort_direction_changeable,
		    params.data, params.rule_set);
	}
    }
    
    OncoprintModel.prototype.setTrackDataIdKey = function(track_id, data_id_key) {
	this.track_data_id_key[track_id] = ifndef(data_id_key, 'id');
	this.computeTrackIdToDatum(track_id);
    }
    var addTrack = function (model, track_id, target_group,
	    track_height, track_padding,
	    data_id_key, tooltipFn,
	    removable, label,
	    sortCmpFn, sort_direction_changeable,
	    data, rule_set) {
	model.track_label[track_id] = ifndef(label, "Label");
	model.track_height[track_id] = ifndef(track_height, 20);
	model.track_padding[track_id] = ifndef(track_padding, 5);
	
	model.setTrackDataIdKey(track_id, ifndef(data_id_key, 'id'));
	model.track_tooltip_fn[track_id] = ifndef(tooltipFn, function (d) {
	    return d + '';
	});
	model.track_removable[track_id] = ifndef(removable, false);
	model.track_sort_cmp_fn[track_id] = ifndef(sortCmpFn, function (a, b) {
	    return 0;
	});
	model.track_sort_direction_changeable[track_id] = ifndef(sort_direction_changeable, false);
	model.setTrackData(track_id, ifndef(data, []));
	
	model.track_rule_set[track_id] = ifndef(rule_set, undefined);

	target_group = ifndef(target_group, 0);
	while (target_group >= model.track_groups.length) {
	    model.track_groups.push([]);
	}
	model.track_groups[target_group].push(track_id);
    }

    var _getContainingTrackGroup = function (oncoprint_model, track_id, return_reference) {
	var group;
	for (var i = 0; i < oncoprint_model.track_groups.length; i++) {
	    if (oncoprint_model.track_groups[i].indexOf(track_id) > -1) {
		group = oncoprint_model.track_groups[i];
		break;
	    }
	}
	if (group) {
	    return (return_reference ? group : group.slice());
	} else {
	    return undefined;
	}
    }

    OncoprintModel.prototype.removeTrack = function (track_id) {
	delete this.track_data[track_id];
	delete this.track_rule_set[track_id];
	delete this.track_label[track_id];
	delete this.track_height[track_id];
	delete this.track_padding[track_id];
	delete this.track_data_id_key[track_id];
	delete this.track_tooltip_fn[track_id];
	delete this.track_removable[track_id];
	delete this.track_sort_cmp_fn[track_id];
	delete this.track_sort_direction_changeable[track_id];

	var containing_track_group = _getContainingTrackGroup(this, track_id, true);
	if (containing_track_group) {
	    containing_track_group.splice(
		    containing_track_group.indexOf(track_id), 1);
	}
    }
    OncoprintModel.prototype.getTrackTop = function (track_id) {
	var groups = this.getTrackGroups();
	var y = 0;
	for (var i = 0; i < groups.length; i++) {
	    var group = groups[i];
	    var found = false;
	    for (var j = 0; j < group.length; j++) {
		if (group[j] === track_id) {
		    found = true;
		    break;
		}
		y += 2 * this.getTrackPadding(group[j]);
		y += this.getTrackHeight(group[j]);
	    }
	    y += this.getTrackGroupPadding();
	    if (found) {
		break;
	    }
	}
	return y;
    }
    OncoprintModel.prototype.getContainingTrackGroup = function (track_id) {
	return _getContainingTrackGroup(this, track_id, false);
    }

    OncoprintModel.prototype.getTrackGroups = function () {
	// TODO: make read-only
	return this.track_groups;
    }

    OncoprintModel.prototype.getTracks = function () {
	var ret = [];
	for (var i = 0; i < this.track_groups.length; i++) {
	    for (var j = 0; j < this.track_groups[i].length; j++) {
		ret.push(this.track_groups[i][j]);
	    }
	}
	return ret;
    }

    OncoprintModel.prototype.moveTrack = function (track_id, new_position) {
	var track_group = _getContainingTrackGroup(this, track_id, true);
	if (track_group) {
	    track_group.splice(track_group.indexOf(track_id), 1);
	    track_group.splice(new_position, 0, track_id);
	}
    }

    OncoprintModel.prototype.getTrackLabel = function (track_id) {
	return this.track_label[track_id];
    }

    OncoprintModel.prototype.getTrackTooltipFn = function (track_id) {
	return this.track_tooltip_fn[track_id];
    }

    OncoprintModel.prototype.getTrackDataIdKey = function (track_id) {
	return this.track_data_id_key[track_id];
    }

    OncoprintModel.prototype.getTrackGroupPadding = function () {
	return this.track_group_padding;
    }

    OncoprintModel.prototype.isTrackRemovable = function (track_id) {
	return this.track_removable[track_id];
    }

    OncoprintModel.prototype.getRuleSet = function (track_id) {
	return this.track_rule_set[track_id];
    }

    OncoprintModel.prototype.setRuleSet = function (track_id, rule_set) {
	this.track_rule_set[track_id] = rule_set;
    }

    OncoprintModel.prototype.getTrackData = function (track_id) {
	return this.display_track_data[track_id];
    }

    OncoprintModel.prototype.setTrackData = function (track_id, data) {
	this.track_data[track_id] = data;
	if (this.getIdOrder(true).length < data.length) {
	    // TODO: handle this properly
	    var data_id_key = this.getTrackDataIdKey(track_id);
	    this.setIdOrder(data.map(function(x) { return x[data_id_key]; }));
	}
	this.computeDisplayTrackData(track_id);
	this.computeTrackIdToDatum(track_id);
    }
    
    OncoprintModel.prototype.computeTrackIdToDatum = function(track_id) {
	this.track_id_to_datum[track_id] = {};
	
	var track_data = this.track_data[track_id] || [];
	var track_id_key = this.track_data_id_key[track_id];
	for (var i=0; i<track_data.length; i++) {
	    this.track_id_to_datum[track_id][track_data[i][track_id_key]] = track_data[i];
	}
    }
    
    OncoprintModel.prototype.setTrackGroupSortPriority = function(priority) {
	this.track_group_sort_priority = priority;
	this.sort();
    }
    
    OncoprintModel.prototype.sort = function() {
	var track_groups = this.getTrackGroups();
	var track_sort_priority = this.track_group_sort_priority.map(function(x) {
	    return track_groups[x];
	}).reduce(function(acc, next) {
	    return acc.concat(next);
	}, []);
	var track_id_to_datum = this.track_id_to_datum;
	
	// TODO: optimize somehow?
	var id_order = this.getIdOrder(true);
	id_order.sort(function(idA, idB) {
	    var ret = 0;
	    for (var h=0; h<track_sort_priority.length; h++) {
		var track_id = track_sort_priority[h];
		ret = this.track_sort_cmp_fn[track_id](track_id_to_datum[idA], track_id_to_datum[idB]);
		if (ret !== 0) {
		    break;
		}
	    }
	    return ret;
	});
	this.setIdOrder(id_order);
    }
    
    OncoprintModel.prototype.setSortConfig = function(params) {
	// TODO
    }
    
    OncoprintModel.prototype.setRuleSet = function(track_id, rule_set) {
	// TODO
    }
    
    OncoprintModel.prototype.computeDisplayTrackData = function(track_id) {
	// Visible ids, in the correct order
	var id_key = this.getTrackDataIdKey(track_id);
	var hidden_ids = this.hidden_ids;
	var id_to_index = this.id_to_index;
	this.display_track_data[track_id] = this.track_data[track_id].filter(function(elt) {
	   return !hidden_ids[elt[id_key]];
	}).sort(function(eltA, eltB) {
	    return id_to_index[eltA[id_key]] - id_to_index[eltB[id_key]];
	});
    }

    return OncoprintModel;
})();

module.exports = OncoprintModel;