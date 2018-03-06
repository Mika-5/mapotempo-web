// Copyright © Mapotempo, 2013-2017
//
// This file is part of Mapotempo.
//
// Mapotempo is free software. You can redistribute it and/or
// modify since you respect the terms of the GNU Affero General
// Public License as published by the Free Software Foundation,
// either version 3 of the License, or (at your option) any later version.
//
// Mapotempo is distributed in the hope that it will be useful, but WITHOUT
// ANY WARRANTY; without even the implied warranty of MERCHANTABILITY
// or FITNESS FOR A PARTICULAR PURPOSE.  See the Licenses for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with Mapotempo. If not, see:
// <http://www.gnu.org/licenses/agpl.html>
//
'use strict';

import * as ajax from '../../assets/javascripts/ajax';
import * as scaffolds from '../../assets/javascripts/scaffolds';
import GlobalConfiguration from '../../assets/javascripts/configuration.js.erb';

const destinations_form = function(params, api) {
  var destination_id = params.destination_id,
    marker_lat = $(":input[name$=\\[lat\\]]").val(),
    marker_lng = $(":input[name$=\\[lng\\]]").val(),
    enable_multi_visits = params.enable_multi_visits;

  params.map_zoom = 15;
  var map = scaffolds.mapInitialize(params);
  L.control.attribution({
    prefix: false
  }).addTo(map);

  // api-web
  var form_popup = L.DomUtil.get('edit-position');
  if (form_popup) {
    form_popup.classList.add('leaflet-bar');
    var control_position = L.Control.extend({
      options: {
        position: 'bottomright'
      },
      onAdd: function() {
        var container = form_popup;
        L.DomEvent.disableClickPropagation(container);
        return container;
      }
    });
    map.addControl(new control_position());
  }

  if (api == 'stores') {
    $('#store_color').simplecolorpicker({
      theme: 'fontawesome'
    });

    scaffolds.customColorInitialize('#store_color');

    //for turbolinks, when clicking on link_to
    $('.selectpicker').selectpicker();
  }


  var markers = {};

  var pointing = false;
  var icon_default = new L.Icon.Default();

  var prepare_display_destination = function(destination) {
    if (destination.geocoding_accuracy) {
      if (destination.geocoding_accuracy > GlobalConfiguration.geocoderAccuracySuccess) {
        destination.geocoding_status = 'success';
      } else if (destination.geocoding_accuracy > GlobalConfiguration.geocoderAccuracyWarning) {
        destination.geocoding_status = 'warning';
      } else {
        destination.geocoding_status = 'danger';
      }
      destination.geocoding_accuracy_percent = Math.round(destination.geocoding_accuracy * 100);
    }
    return destination;
  };

  var wire = function(row) {
    var $row = $(row),
      id = $row.attr('data-destination_id');

    if (GlobalConfiguration.geocodeComplete) {
      $row.one("focus", ":input[name$=\\[street\\]]", function() {
        $(this).autocomplete({
          delay: 500,
          source: function(req, add) {
            $.ajax({
              type: "patch",
              data: $(":input", $row).serialize(),
              url: '/api/0.1/' + api + '/geocode_complete.json',
              beforeSend: ajax.beforeSendWaiting,
              success: function(data) {
                add($.map(data, function(val, i) {
                  return {
                    label: val.street + ' ' + val.postalcode + ' ' + val.city + ' ' + val.country,
                    value: val.street
                  };
                }));
              },
              complete: ajax.completeWaiting,
              error: ajax.ajaxError
            });
          },
          select: function(event, ui) {
            event.target.value = ui.item.value;
            $(event.target).trigger('change');
          }
        });
      });
    }

    $row.on("change", ":input", function(event, move) {
      if (move === undefined && event.currentTarget.name.match(/\[street\]|\[postalcode\]|\[city\]|\[country\]|\[lat\]|\[lng\]$/))
        move = true;
      var url;
      if (event.currentTarget.name.match(/\[street\]|\[postalcode\]|\[city\]|\[country\]$/)) {
        url = '/api/0.1/' + api + '/geocode.json';
      } else {
        if (event.currentTarget.name.match(/\[lat\]|\[lng\]$/)) {
          var latChg = $(":input[id$=_lat]").val(),
            lngChg = $(":input[id$=_lng]").val();
          if (!latChg || !lngChg) {
            if (destination_id in markers) {
              map.removeLayer(markers[destination_id]);
              delete markers[destination_id];
            }
            $('#no_geocoding_accuracy').show();
            $('#geocoding-level').hide();
          }
          else {
            if (destination_id in markers) {
              markers[destination_id].setLatLng(new L.LatLng(latChg, lngChg));
            } else {
              addMarker(destination_id, latChg, lngChg);
            }
            if (move) {
              if (map.getZoom() != 16 || !map.getBounds().contains(markers[destination_id].getLatLng())) {
                map.setView(markers[destination_id].getLatLng(), 16);
              }
            }
            displayGeocoding(0, null, 'point');
          }
        }
        return;
      }
      confirmGeocode({
        type: "patch",
        data: $("#destination-details").find("input"),
        url: url,
        beforeSend: ajax.beforeSendWaiting,
        success: function(data) {
          $("#reverse-geocode").html("");
          update(id, data, move);
        },
        complete: ajax.completeWaiting,
        error: ajax.ajaxError
      });
    })
      .on("click", ".pointing + span", function() {
        pointing = id;
        $('body').css('cursor', 'crosshair');
        $('.leaflet-container').css('cursor', 'crosshair');
      });

    $('a.pointing').click(function() {
      pointing = id;
      $('body').css('cursor', 'crosshair');
      $('.leaflet-container').css('cursor', 'crosshair');
    });
  };

  var confirmGeocode = function(ajaxParams) {
    if ($('[name$=\\[geocoding_level\\]]').val() == 'point') {
      if (confirm(I18n.t('destinations.form.dialog.confirm_overwrite_point'))) {
        $('[name$=\\[lat\\]]').val('');
        $('[name$=\\[lng\\]]').val('');
        $.ajax(ajaxParams);
      }
    } else {
      $('[name$=\\[lat\\]]').val('');
      $('[name$=\\[lng\\]]').val('');
      $.ajax(ajaxParams);
    }
  };

  var displayGeocoding = function(accuracy_percent, status, level) {
    $('#geocoding_fail').hide();
    if (accuracy_percent != 0 && status) {
      $('#geocoding_accuracy').show();
      var progress = $('.progress div');
      progress.css('width', accuracy_percent + '%');
      progress.removeClass('progress-bar-success progress-bar-warning progress-bar-danger');
      progress.addClass('progress-bar-' + status);
      $('.progress div span').html(accuracy_percent + '%');
    } else
      $('#geocoding_accuracy').hide();
    $('[name$=\\[geocoding_accuracy\\]]').val(accuracy_percent / 100);
    if (level == 'point')
      $('#no_geocoding_accuracy').show();
    else
      $('#no_geocoding_accuracy').hide();
    $('#geocoding_level').show();
    $('[name$=\\[geocoding_level\\]]').val(level);
    $('.geocoding-level').hide();
    $('#geocoding-level-' + level).show();
    var translation_level = 'destinations.form.geocoding_level.' + level;
    $('#geocoding-level-value').html(I18n.t(translation_level));
  };

  var update = function(destination_id, destination, move) {
    var row = $('[data-destination_id=' + destination_id + ']');
    $('[name$=\\[name\\]]', row).val(destination.name);
    $('[name$=\\[street\\]]', row).val(destination.street);
    $('[name$=\\[postalcode\\]]', row).val(destination.postalcode);
    $('[name$=\\[city\\]]', row).val(destination.city);
    $('[name$=\\[country\\]]', row).val(destination.country);
    $('[name$=\\[lat\\]]', row).val(destination.lat);
    $('[name$=\\[lng\\]]', row).val(destination.lng);
    if ($.isNumeric(destination.lat) && $.isNumeric(destination.lng)) {
      if (destination_id in markers) {
        markers[destination_id].setLatLng(new L.LatLng(destination.lat, destination.lng));
      } else {
        addMarker(destination_id, destination.lat, destination.lng);
      }
      if (move) {
        if (map.getZoom() != 16 || !map.getBounds().contains(markers[destination_id].getLatLng())) {
          map.setView(markers[destination_id].getLatLng(), 16);
        }
      }
    } else if (destination_id in markers) {
      map.removeLayer(markers[destination_id]);
      delete markers[destination_id];
    }
    if (destination.street || destination.postalcode || destination.city) {
      if (destination.geocoding_accuracy) {
        destination = prepare_display_destination(destination);
        displayGeocoding(destination.geocoding_accuracy_percent, destination.geocoding_status, destination.geocoding_level);
      } else {
        $('#no_geocoding_accuracy').hide();
        $('#geocoding_accuracy').hide();
        $('[name$=\\[geocoding_accuracy\\]]').val(null);
        $('#geocoding_level').hide();
        $('[name$=\\[geocoding_level\\]]', row).val(null);
        $('#geocoding_fail').show();
      }
    } else {
      $('#no_geocoding_accuracy').show();
      $('#geocoding_accuracy').hide();
      $('[name$=\\[geocoding_accuracy\\]]').val(null);
      $('#geocoding_fail').hide();
      $('#geocoding_level').hide();
      $('[name$=\\[geocoding_level\\]]', row).val(null);
    }
  };

  var markerChange = function(id, latLng) {
    var row = $('[data-destination_id=' + id + ']');
    displayGeocoding(0, null, 'point');
    reverse_geocoding(latLng);
    $('[name$=\\[lat\\]]', row).val(latLng.lat.toFixed(6));
    $('[name$=\\[lng\\]]', row).val(latLng.lng.toFixed(6)).trigger('change', false);
  };

  var reverse_geocoding = function(coords) {
    if (coords instanceof L.LatLng) {
      $.ajax({
        url: '/api/0.1/' + api + '/reverse.json',
        data: {
          lat: coords.lat,
          lng: coords.lng
        },
        type: 'patch',
        dataType: 'json',
        success: function(json) {
          if (json && json.success) {

            var button = $("<button />").addClass("btn btn-default btn-xs pull-right")
              .attr("type", "button")
              .text(I18n.t('destinations.reverse_geocoding.apply'))
              .on("click", json.result, function(event) {

                var street = event.data.name ? event.data.name : "";
                if (event.data.housenumber && event.data.street) {
                  street = event.data.housenumber + ' ' + event.data.street;
                }

                if (api == 'stores') {
                  $("#store_country").val(event.data.country ? event.data.country : "");
                  $("#store_city").val(event.data.city);
                  $("#store_postalcode").val(event.data.postcode);
                  $("#store_street").val(street);
                } else {
                  $("#destination_country").val(event.data.country ? event.data.country : "");
                  $("#destination_city").val(event.data.city);
                  $("#destination_postalcode").val(event.data.postcode);
                  $("#destination_street").val(street);
                }

              });

            $("#reverse-geocode").html(json.result.label).append(button);

          } else {
            $("#reverse-geocode").html('');
          }
        },
        error: ajax.ajaxError
      });
    }
  };

  map.on('click', function(mouseEvent) {
    if (pointing !== false) {
      if (pointing in markers) {
        markers[pointing].setLatLng(mouseEvent.latlng);
      } else {
        addMarker(pointing, mouseEvent.latlng.lat, mouseEvent.latlng.lng);
      }
      markerChange(pointing, mouseEvent.latlng);
      pointing = false;
      $('body, .leaflet-container').css('cursor', '');
    }
  });

  wire($("form[data-destination_id]"));

  var addMarker = function(id, lat, lng) {
    var marker = L.marker(new L.LatLng(lat, lng), {
      icon: icon_default,
      draggable: true,
      destination: id
    }).addTo(map);

    marker.on('dragend', function(event) {
      markerChange(event.target.options.destination, event.target.getLatLng());
      reverse_geocoding(event.target.getLatLng());
    });
    markers[id] = marker;
  };

  if ($.isNumeric(marker_lat) && $.isNumeric(marker_lng)) {
    addMarker(destination_id, marker_lat, marker_lng);
  }

  $('#visit-new').click(function() {
    var $fieldsets = $('#visits').find('fieldset');
    if (enable_multi_visits || $fieldsets.length == 0) {
      var fieldsetVisit = $('#visit-fieldset-template');
      $('#visits').append(fieldsetVisit.html()
        .replace('#0', '#' + ($fieldsets.length + 1))
        .replace(/isit0/g, 'isit' + ($fieldsets.length + 1))
        .replace(/destination([\[_])visits([^0]+)0([\]_])/g, "destination$1visits$2" + ($fieldsets.length + 1) + "$3")
      );
      initVisits($('#visits').find('fieldset:last-child'));
    }
  });

  $("label[for$='destroy']").hide();

  var initVisits = function(parent) {
    $("input:checkbox[id$='_destroy']", parent).change(function() {
      var fieldset = $(this).closest('fieldset');
      $("label[for$='destroy']", fieldset).toggle(200);
      $("div.form-group", fieldset).toggle(200);
    });
    $('.flag-destroy', parent).click(function() {
      var fieldset = $(this).closest('fieldset');
      $("input:checkbox", fieldset).prop("checked", function(i, val) {
        return !val;
      });
      $("label[for$='destroy']", fieldset).toggle(200);
      $("div.form-group", fieldset).toggle(200);
    });

    $('[name$=\\[take_over\\]]', parent).timeEntry({
      show24Hours: true,
      showSeconds: true,
      initialField: 1,
      defaultTime: '00:00:00',
      spinnerImage: ''
    });

    $('[name$=\\[open1\\]], [name$=\\[close1\\]], [name$=\\[open2\\]], [name$=\\[close2\\]]', parent).timeEntry({
      show24Hours: true,
      spinnerImage: '',
      defaultTime: '00:00'
    });

    var formatNoMatches = I18n.t('web.select2.empty_result');
    $('select[name$=\\[tag_ids\\]\\[\\]]', parent).select2({
      theme: 'bootstrap',
      minimumResultsForSearch: -1,
      templateSelection: scaffolds.templateTag,
      templateResult: scaffolds.templateTag,
      formatNoMatches: function() {
        return formatNoMatches;
      },
      width: '100%'
    });

    $('[name*=\\[quantities_operations\\]]').change(function() {
      var $this = $(this);
      var quantity = $this.closest('[data-deliverable_unit_id]').find('[name*=\\[quantities\\]]');
      if (($this.val() == 'fill' || $this.val() == 'empty') && !quantity.val())
        quantity.val('0');
    });

    $('.quantities_operations').popover();

    $('[name$=\\[priority\\]]', parent).slider({
      ticks: [-4, 0, 4],
      ticks_labels: [
        I18n.t('visits.priority_level.low'),
        I18n.t('visits.priority_level.medium'),
        I18n.t('visits.priority_level.high')
      ],
      step: 4,
      ticks_snap_bounds: 4
    });
  };
  initVisits($('form[data-destination_id]'));

  if (window.location.hash) {
    $('#visits').find('.collapse.in').each(function() {
      var $this = $(this);
      if (window.location.hash != '#' + $this.attr('id'))
        $this.removeClass('in');
    });
    $("#visits").find(".accordion-toggle[href!='" + window.location.hash + "']").addClass('collapsed');
  }
};


var destinations_import = function(params, api) {
  var dialog_upload = scaffolds.bootstrap_dialog({
    title: I18n.t(api + '.index.dialog.import.title'),
    icon: 'fa-upload',
    message: SMT['modals/default_with_progress']({
      msg: I18n.t(api + '.index.dialog.import.in_progress')
    })
  });

  $(":file").filestyle({
    buttonName: "btn-primary",
    iconName: "fa fa-folder-open",
    buttonText: I18n.t('web.choose_file')
  });

  $('#import_csv_replace_1').click(function() {
    if ($(this).is(':checked')) {
      $('#import_csv_delete_plannings').prop('checked', true);
    }
  });
  $('form#new_import_csv, form#new_import_tomtom').submit(function() {
    var confirmChecks = [];
    $('input[id$=replace_1]', $(this)).is(':checked') && confirmChecks.push('replace');
    $('input[name$=\\[delete_plannings\\]]', $(this)).is(':checked') && confirmChecks.push('delete_plannings');
    if (confirmChecks.length > 0 && !confirm(confirmChecks.map(function(c) {
      var store_import_translation = 'stores.import.' + c + '_confirm';
      var destination_import_translation = 'destinations.import.' + c + '_confirm';
      return (api == 'stores') ? I18n.t(store_import_translation) : I18n.t(destination_import_translation);
    }).join(" \n"))) {
      return false;
    }
    dialog_upload.modal(scaffolds.modal_options());
  });

  $('a.column-edit').click(function(evt) {
    var $elem = $(evt.currentTarget).closest('td');
    $('.column-default, .column-edit', $elem).hide();
    $('.column-def', $elem).removeClass('hide').popover({
      placement: 'left',
      content: I18n.t('destinations.import.dialog.help.def_example'),
      trigger: 'focus'
    }).focus();
    $('[name=columns-save]').show();
  });

  $('[name=columns-save]').click(function() {
    var columnsDef = $('.column-def')
      .filter(function(i, e) {
        return $(e).val();
      })
      .map(function(i, e) {
        return '"' + $(e).attr('name').replace(/import_csv\[column_def\]\[([^\]]+)\]/, '$1') + '": ' + JSON.stringify($(e).val());
      }).get().join(', ');
    $.ajax({
      type: 'put',
      data: 'advanced_options={"import": {"destinations": {"spreadsheetColumnsDef": {' + columnsDef + '}}}}',
      url: '/api/0.1/customers/' + params.customer_id + '.json'
    });
  });
};

var destinations_index = function(params, api) {
  var default_city = params.default_city,
    default_country = params.default_country,
    take_over_default = params.take_over_default,
    url_click2call = params.url_click2call,
    enable_references = params.enable_references,
    enable_multi_visits = params.enable_multi_visits,
    enable_orders = params.enable_orders,
    isEditable = params.is_editable,
    disableQuantity = params.disable_quantity;

  params.geocoder = true;

  var map = scaffolds.mapInitialize(params);
  L.control.attribution({
    prefix: false
  }).addTo(map);
  L.control.scale({
    imperial: false
  }).addTo(map);

  var deleteMarkerOnMapRelease = function(id) {
    var queueDeleteFn = function() {
      markersLayers.removeLayer(markers[id]);
      delete markers[id];

      map.off('moveend animationend', queueDeleteFn);
    };

    map.on('moveend animationend', queueDeleteFn);
  };

  var markers       = {};
  var markersLayers = new L.MarkerClusterGroup({
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
    zoomToBoundsOnClick: true,
    spiderfyDistanceMultiplier: 2
  });

  map.addLayer(markersLayers);

  var tags = {};
  var pointing = false;

  // Only use our Icon or chrome crashes
  var pointsH = L.point(24, 40), pointsV = L.point(12, pointsH.y),
    iconDefault = new L.Icon({
      iconUrl: '/images/marker-428BCA.svg',
      iconSize: pointsH,
      iconAnchor: pointsV
    }),
    iconOver = new L.Icon({
      iconUrl: '/images/marker-FFBB00.svg',
      iconSize: pointsH,
      iconAnchor: pointsV
    });
  var iconOverStack = [];

  var prepare_display_destination = function(destination) {
    // must be set here instead of in json because api used for update don't expose all attributes...
    destination.enable_references = enable_references;
    destination.enable_multi_visits = enable_multi_visits;
    destination.enable_orders = enable_orders;
    destination.i18n = ajax.mustache_i18n;
    if (destination.geocoding_accuracy) {
      if (destination.geocoding_accuracy > GlobalConfiguration.geocoderAccuracySuccess) {
        destination.geocoding_status = 'success';
      } else if (destination.geocoding_accuracy > GlobalConfiguration.geocoderAccuracyWarning) {
        destination.geocoding_status = 'warning';
      } else {
        destination.geocoding_status = 'danger';
      }
      destination.geocoding_accuracy_percent = Math.round(destination.geocoding_accuracy * 100);
    }
    if (destination.geocoding_level) {
      var geocoding_translation = 'destinations.form.geocoding_level.' + destination.geocoding_level;
      destination['geocoding_level_' + destination.geocoding_level] = true;
      destination['geocoding_level_title'] = I18n.t('destinations.index.geocoding_level') + ' : ' + I18n.t(geocoding_translation);
    }
    if (destination.lat === null || destination.lng === null) {
      destination.has_no_position = I18n.t('destinations.index.no_position');
    }
    destination.default_country = default_country;

    var t = [];
    $.each(tags, function(j, tag) {
      t.push({
        id: tag.id,
        label: tag.label,
        color: tag.color ? tag.color.substr(1) : undefined,
        icon: tag.icon,
        active: $.inArray(tag.id, destination.tag_ids) >= 0
      });
    });
    destination.tags = t;

    $.each(destination.visits, function(i, visit) {
      destination.visits[i].ref_visit = visit.ref;
      destination.visits[i].ref = undefined;
      t = [];
      $.each(tags, function(j, tag) {
        t.push({
          id: tag.id,
          label: tag.label,
          color: tag.color ? tag.color.substr(1) : undefined,
          icon: tag.icon,
          active: $.inArray(tag.id, visit.tag_ids) >= 0
        });
      });
      destination.visits[i].tags_visit = t;
      destination.visits[i].tags = undefined;
      destination.visits[i].disable_quantity = disableQuantity;
      if (visit.open1) {
        destination.visits[i].open1 = visit.open1.split(':').slice(0, 2).join(':');
      }
      if (visit.close1) {
        destination.visits[i].close1 = visit.close1.split(':').slice(0, 2).join(':');
      }
      if (visit.open2) {
        destination.visits[i].open2 = visit.open2.split(':').slice(0, 2).join(':');
      }
      if (visit.close2) {
        destination.visits[i].close2 = visit.close2.split(':').slice(0, 2).join(':');
      }
      destination.visits[i].take_over_default = take_over_default;
    });

    if (destination.phone_number) {
      ajax.phoneNumberCall(destination, url_click2call);
    }

    return destination;
  };

  var wire = function(row, editable) {
    var $row = $(row),
      id = $row.attr('data-destination_id');
    if (isEditable || editable) {

      if (GlobalConfiguration.geocodeComplete) {
        $row.one("focus", ":input[name$=\\[street\\]]", function() {
          $(this).autocomplete({
            delay: 500,
            source: function(req, add) {
              $.ajax({
                type: "patch",
                data: $(":input", $row).serialize(),
                url: '/api/0.1/' + api + '/geocode_complete.json',
                beforeSend: ajax.beforeSendWaiting,
                success: function(data) {
                  add($.map(data, function(val, i) {
                    return {
                      label: val.street + ' ' + val.postalcode + ' ' + val.city + ' ' + val.country,
                      value: val.street
                    };
                  }));
                },
                complete: ajax.completeWaiting,
                error: ajax.ajaxError
              });
            },
            select: function(event, ui) {
              event.target.value = ui.item.value;
              $(event.target).trigger('change');
            }
          });
        });
      }

      $row.on("change", ":input:not(:checkbox)", function(event, move) {
        if (move === undefined && event.currentTarget.name.match(/\[street\]|\[postalcode\]|\[city\]|\[country\]|\[lat\]|\[lng\]$/))
          move = true;
        var url = '/api/0.1/' + api + '/' + id + '.json';
        var geocode = false;
        if (event.currentTarget.name.match(/\[street\]|\[postalcode\]|\[city\]|\[country\]$/)) {
          if ($('[name$=\\[geocoding_level\\]]', row).val() == 'point')
            geocode = 'confirm';
          else
            geocode = true;
        }
        if (geocode == 'confirm') {
          if (confirm(I18n.t('destinations.form.dialog.confirm_overwrite_point'))) {
            $('[name$=\\[lat\\]]', row).val(null);
            $('[name$=\\[lng\\]]', row).val(null);
          }
        } else if (geocode) {
          $('[name$=\\[lat\\]]', row).val(null);
          $('[name$=\\[lng\\]]', row).val(null);
        }
        $.ajax({
          type: "put",
          data: $(":input", $row).serialize(), // serialize is mandatory for multiple values in select2
          url: url,
          beforeSend: ajax.beforeSendWaiting,
          success: function(data) {
            update(id, data, move);
          },
          complete: ajax.completeWaiting,
          error: function(request, status, error) {
            if (event.currentTarget.name) $('[name=' + event.currentTarget.name.replace(/([\[\]])/g, "\\$1") + ']', row).val(event.currentTarget.defaultValue);
            ajax.ajaxError(request, status, error);
          }
        });
      })
        .on("click", ".pointing + span", function() {
          pointing = id;
          $('body').css('cursor', 'crosshair');
          $('.leaflet-container').css('cursor', 'crosshair');
        });

      var formatNoMatches = I18n.t('web.select2.empty_result');
      ajax.fake_select2($('select[name$=\\[tag_ids\\]\\[\\]]', $row), function(select) {
        select.select2({
          theme: 'bootstrap',
          minimumResultsForSearch: -1,
          templateSelection: scaffolds.templateTag,
          templateResult: scaffolds.templateTag,
          formatNoMatches: function() {
            return formatNoMatches;
          },
          width: '100%'
        });
        select.next('.select2-container--bootstrap').addClass('input-sm');
      });
    }
    toogleClickForRow($row, id, true);
  };

  var ajaxCallForRow = function($row, id) {
    $row.on("click", ".destroy", function(event) {
      if (confirm(I18n.t('all.verb.destroy_confirm'))) {
        event.stopPropagation(); // Don't call over(id, move) while the row has been destroyed
        toogleClickForRow($row);
        $.ajax({
          type: "delete",
          url: '/api/0.1/' + api + '/' + id + '.json',
          beforeSend: ajax.beforeSendWaiting,
          success: function() {
            $row.remove();
            if (markers[id]) {
              var keys  = Object.keys(markers);
              var index = keys.indexOf(id);
              deleteMarkerOnMapRelease(id);

              keys.splice(index, 1);
              var last = keys[index] || keys[index - 1];
              if (last)
                over(last, true);
            }
            countDec();
          },
          complete: ajax.completeWaiting,
          error: function(request, status, error) {
            ajax.ajaxError(request, status, error);
            toogleClickForRow($row, id, true);
          }
        });
      }
    });
  };

  // Unbind / bind events according to the current operation. (Prevents deleting non existing objects issue)
  var toogleClickForRow = function(row, id, addOrRemove) {
    if (addOrRemove) {
      row.click(function() { over(id, true); });
      ajaxCallForRow(row, id);
    } else {
      row.off('click');
    }
  };

  var update = function(id, destination, move) {
    if (isEditable) {
      var row = $('[data-destination_id=' + id + ']'),
        destination = prepare_display_destination(destination);
      $('select[name$=\\[tag_ids\\]\\[\\]]', row).each(function() {
        $(this).data('select2') && $(this).select2('close');
      });
      $(row).replaceWith(SMT['destinations/edit'](destination));
      row = $('[data-destination_id=' + id + ']');
      setInputTitles(row);
      wire(row);
      $('.destinations').trigger('update');

      if ($.isNumeric(destination.lat) && $.isNumeric(destination.lng)) {
        if (id in markers) {
          markers[id].setLatLng(new L.LatLng(destination.lat, destination.lng));
        } else {
          addMarker(id, destination.lat, destination.lng);
        }
        if (move) {
          if (map.getZoom() != 16 || !map.getBounds().contains(markers[id].getLatLng())) {
            map.setView(markers[id].getLatLng(), 16);
          }
        }
      } else if (id in markers) {
        deleteMarkerOnMapRelease(id);
      }
    }
  };

  var count = function() {
    var n = $('.destinations tr:visible').length;
    $("#count").html(n);
    var v = $('.destinations tr:visible [role="visit"]').length;
    $("#count-visits").html(v);
  };

  var countInc = function() {
    $("#count").html(parseInt($("#count").text()) + 1);
    $("#count-visits").html(parseInt($("#count-visits").text()) + 1);
  };

  var countDec = function() {
    $("#count").html(parseInt($("#count").text()) - 1);
    var v = $('.destinations tr:visible [role="visit"]').length;
    $("#count-visits").html(v);
  };

  var markerChange = function(id, latLng) {
    var row = $('[data-destination_id=' + id + ']');
    $('[name$=\\[geocoding_level\\]]', row).val('point');
    $('[name$=\\[lat\\]]', row).val(latLng.lat.toFixed(6));
    $('[name$=\\[lng\\]]', row).val(latLng.lng.toFixed(6)).trigger('change', false);
  };

  map.on('click', function(mouseEvent) {
    if (pointing !== false) {
      if (pointing in markers) {
        markers[pointing].setLatLng(mouseEvent.latlng);
      } else {
        addMarker(pointing, mouseEvent.latlng.lat, mouseEvent.latlng.lng);
      }
      markerChange(pointing, mouseEvent.latlng);
      pointing = false;
      $('body, .leaflet-container').css('cursor', '');
    }
  });

  var over = function(id, move) {
    if (iconOverStack.indexOf(id) != -1)
      return;
    // clean over
    $('.destination').removeClass('highlight');
    var i;
    while (i = iconOverStack.pop()) {
      if (i in markers) {
        markers[i].setIcon(iconDefault).setZIndexOffset(1);
      }
    }
    if (id in markers) {
      spiderfyCluster(null, id, move, function(id) {
        markers[id].setIcon(iconOver).setZIndexOffset(100);

        markersLayers.refreshClusters();
      });
      iconOverStack.push(id);
    }

    var row = $('[data-destination_id=' + id + ']');
    row.addClass('highlight');
    if (row.position().top < $("#destination_box").scrollTop() || row.position().top > $("#destination_box").scrollTop() + $("#destination_box").height()) {
      $("#destination_box").animate({
        scrollTop: row.position().top - 100
      });
    }
  };

  var spiderfyCluster = function(layer, id, move, callback) {
    var localCluster = markersLayers.hasLayer(markers[id]) && markers[id].__parent;

    if (move) {
      if (localCluster && (localCluster instanceof L.MarkerCluster)) {
        markersLayers.zoomToShowLayer(markers[id], function() {
          map.setView(markers[id].getLatLng(), map.getZoom(), { animate: true, duration: 600 });
          callback(id);
          return true;
        });
      } else {
        callback(id);
      }
    } else {
      callback(id);
    }
  };

  var addMarker = function(id, lat, lng) {
    var marker = L.marker(new L.LatLng(lat, lng), {
      icon: iconDefault,
      draggable: isEditable,
      destination: id
    }).addTo(markersLayers);
    marker.on('dragend', function(event) {
      markerChange(event.target.options.destination, event.target.getLatLng());
    });
    marker.on('click', function(mouseEvent) {
      if (!pointing) {
        over(mouseEvent.target.options.destination, false);
      }
    });
    markers[id] = marker;
  };

  if (!params.reached_max_destinations) {
    $("#add").click(function() {
      var id = 0;
      var center = map.getCenter();
      var destination = {
        id: id,
        name: I18n.t('destinations.index.default_name'),
        city: default_city,
        default_country: default_country,
        lat: center.lat,
        lng: center.lng,
        take_over_default: take_over_default,
        visits_attributes: [{}]
      };
      $.ajax({
        type: "post",
        data: JSON.stringify(destination),
        contentType: 'application/json',
        url: '/api/0.1/destinations.json',
        beforeSend: ajax.beforeSendWaiting,
        success: function(data) {
          $(".destinations").append(SMT['destinations/edit'](prepare_display_destination(data)));
          wire($('.destinations tr').last(), true)
          countInc();
        },
        complete: ajax.completeWaiting,
        error: ajax.ajaxError
      });
    });
  } else {
    $('#add').hide();
  }

  var filter_text = function(exactText, normalizedValue, filter) {
    return !!String(exactText).match(new RegExp(filter.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&"), 'i'));
  };

  var filter_number = function(exactText, normalizedValue, filter) {
    return normalizedValue == filter;
  };

  var filter_phone = function(exactText, normalizedValue, filter) {
    return !!String(normalizedValue).match(new RegExp(simply_phone(filter).replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&"), 'i'));
  };

  var simply_phone = function(number) {
    return number && number.replace(/^0|[-. ]/g, '');
  };

  var globalGeocodingScore = function(level, accuracy, lat, lng) {
    var ret = (lat === '' || lng === '') ? 0 : null;
    switch (level) {
      case 'point':
        ret = 5000;
        break;
      case 'house':
        ret = 4000;
        break;
      case 'street':
        ret = 3000;
        break;
      case 'intersection':
        ret = 2000;
        break;
      case 'city':
        ret = 1000;
        break;
    }
    if (accuracy)
      ret += parseFloat(accuracy) * 100;
    return ret;
  };

  var sortList = undefined;

  var setInputTitles = function(row) {
    $(row).find('input:not([type=checkbox])').each(function(i, element) {
      $(element).tooltip({title: element.value, placement: 'bottom'});
    });
  };

  var displayDestinations = function(data) {

    var errorCallback = function() {
      stickyError(I18n.t('destinations.index.dialog.geocoding.error'));
    };

    if (!ajax.progressDialog(data.geocoding, dialog_geocoding, '/destinations.json', checkForDisplayDestinations, {error: errorCallback})) {
      return;
    }

    var table = $('.destinations');
    $.each(data.tags, function(i, tag) {
      tags[tag.id] = tag;
    });
    $.each(data.destinations, function(i, destination) {
      destination = prepare_display_destination(destination);
      $(table).append(SMT[isEditable ? 'destinations/edit' : 'destinations/show'](destination));
      if ($.isNumeric(destination.lat) && $.isNumeric(destination.lng)) {
        addMarker(destination.id, destination.lat, destination.lng);
      }
    });

    if (markersLayers.getLayers().length > 0) {
      map.fitBounds(markersLayers.getBounds(), {
        maxZoom: 15,
        padding: [20, 20]
      });
    }

    count();

    $('tr', table).each(function(index, element) {
      setInputTitles(element);
      wire(element);
    });

    $('#destination_box').find('table').on('tablesorter-initialized', function() {
      var
        $table = $(this),
        c = this.config,
        wo = c && c.widgetOptions,
        // include sticky header checkbox; if installed
        $sticky = c && wo.$sticky || '',
        doChecky = function(c, col) {
          $table
            .children('tbody')
            .children('tr:visible')
            .children('td:nth-child( ' + (parseInt(col, 10) + 1) + ' )')
            .find('input[type=checkbox]')
            .each(function() {
              this.checked = c;
              $(this).trigger('change');
            });
        };

      $table
        .children('tbody')
        .on('change', 'input[type=checkbox]', function() {
          // ignore change if updating all rows
          if ($table[0].ignoreChange) {
            return;
          }
          // uncheck header if any checkboxes are unchecked
          if (!this.checked) {
            $table.add($sticky).find('thead input[type=checkbox]').prop('checked', false);
          }
        })
        .end()
        .add($sticky)
        .find('thead input[type=checkbox]')
        // Click on checkbox in table header to toggle all inputs
        .on('change', function() {
          // prevent updateCell for every cell
          $table[0].ignoreChange = true;
          var c = this.checked,
            col = $(this).closest('th').attr('data-column');
          doChecky(c, col);
          // update main & sticky header
          $table.add($sticky).find('th[data-column=' + col + '] input[type=checkbox]').prop('checked', c);
          // update all at once
          $table[0].ignoreChange = false;
        })
        .on('mouseup', function() {
          return false;
        });

      $('.index_toggle_selection').click(function() {
        $('tr.destination').not('.filtered').each(function(idx, row) {
          $('input:checkbox', row).each(function() {
            this.checked = !this.checked;
          });
        });
      });
    });

    var tableOptions = {
      sortList: sortList,
      textExtraction: function(node, table, cellIndex) {
        var $node = $(node);
        if (isEditable) {
          if ($node.hasClass('phone')) {
            return simply_phone($("[name$=\\[phone_number\\]]", node).val());
          } else if ($node.hasClass('tags')) {
            return $.map($("[name$=\\[tag_ids\\]\\[\\]] :selected", node), function(e) {
              return e.text;
            }).sort().join(',');
          } else if ($node.hasClass('geocoding')) {
            return globalGeocodingScore($("[name$=\\[geocoding_level\\]]", node).val(), $("[name$=\\[geocoding_accuracy\\]]", node).val(), $("[name$=\\[lat\\]]", node).val(), $("[name$=\\[lng\\]]", node).val());
          } else if ($node.hasClass('visit')) {
            return $.map($("input[type!=hidden]", node), function(e) {
              return e.value;
            }).sort().join(',') + ',' + $.map($("[name$=\\[tag_ids\\]\\[\\]] :selected", node), function(e) {
              return e.text;
            }).sort().join(',');
          } else {
            return $.map($(":input", node), function(e) {
              return e.value;
            }).join(",");
          }
        } else {
          if ($node.hasClass('phone')) {
            return simply_phone($node.text());
          } else if ($node.hasClass('geocoding')) {
            return globalGeocodingScore($("[name$=\\[geocoding_level\\]]", node).val(), $("[name$=\\[geocoding_accuracy\\]]", node).val(), '', '');
          } else {
            return $node.text();
          }
        }
      },
      theme: "bootstrap",
      // show an indeterminate timer icon in the header when the table is sorted or filtered.
      showProcessing: true,
      // Show order icon v and ^
      headerTemplate: '{content} {icon}',
      widgets: ["uitheme", "filter", "columnSelector"],
      widgetOptions: {
        scroller_height: 220,
        // scroll tbody to top after sorting
        scroller_upAfterSort: true,
        // pop table header into view while scrolling up the page
        scroller_jumpToHeader: true,
        // In tablesorter v2.19.0 the scroll bar width is auto-detected
        // add a value here to override the auto-detected setting
        scroller_barWidth: null,
        filter_childRows: true,
        // class name applied to filter row and each input
        filter_cssFilter: "tablesorter-filter",
        filter_placeholder: {
          search: I18n.t('web.placeholder_filter')
        },
        filter_functions: {
          '.name': filter_text,
          '.address': filter_text,
          '.country': filter_text,
          '.comment': filter_text,
          '.phone': filter_phone,
          '.visit': filter_text
        },
        columnSelector_container: $('#columnSelector'),
        columnSelector_name: 'data-selector-name',
        columnSelector_priority: 'data-priority',
        columnSelector_layout: '<li role="presentation"><label><input type="checkbox">{name}</label></li>'
      }
    };
    $("#destination_box").find("table").tablesorter(tableOptions).bind('filterEnd', function() {
      count();

      markersLayers.clearLayers();
      $('.destinations tr:visible').each(function(i, e) {
        var marker = markers[$(e).attr('data-destination_id')];
        if (marker) {
          markersLayers.addLayer(marker);
        }
      });
    });
    $(".tablesorter-filter").addClass("form-control input-sm"); // filter_cssFilter not support setting multiple class at once

    $("#multiple-delete").on("click", function() {
      if (confirm(I18n.t('all.verb.destroy_confirm'))) {
        var destination_ids = $.map($('table tbody :checkbox:checked').closest('tr'), function(val) {
          return $(val).data('destination_id');
        });

        $.ajax({
          type: "delete",
          url: '/api/0.1/' + api + '.json?' + $.param({
            ids: destination_ids.join()
          }),
          beforeSend: ajax.beforeSendWaiting,
          success: function(data) {
            $.map($('table tbody :checkbox:checked').closest('tr'), function(row, i) {
              var row = $(row);
              var id = row.data('destination_id');
              row.remove();
              if (markers[id]) {
                deleteMarkerOnMapRelease(id);
              }
              countDec();
            });
          },
          complete: ajax.completeWaiting,
          error: ajax.ajaxError
        });
      }
    });
  };

  var checkForDisplayDestinations = function(data) {
    var isAccuracyDanger = data.destinations && $.grep(data.destinations, function(dest) {
      return dest.geocoding_accuracy && dest.geocoding_accuracy < GlobalConfiguration.geocoderAccuracyWarning;
    }).length > 0;

    if (isAccuracyDanger) {

      var displayDestinationsAfterModal = function() {
        var cursorBody = $('body').css('cursor');
        var cursorMap = $('#map').css('cursor');
        $('body, #map').css({
          cursor: 'progress'
        });
        setTimeout(function() {
          displayDestinations(data);
          $('body').css({
            cursor: cursorBody
          });
          $('#map').css({
            cursor: cursorMap
          });
        }, 200);
      };

      if (dialog_geocoding) dialog_geocoding.modal('hide');
      $('#geocoding-danger-modal').modal({
        keyboard: true,
        show: true
      });
      $("#sort-geocoding").click(function() {
        $('#geocoding-danger-modal').off('hidden.bs.modal', displayDestinationsAfterModal);
        $('#geocoding-danger-modal').modal('hide');
        sortList = [
          [$('.tablesorter th').index($('th.geocoding')[0]), 0]
        ];
        displayDestinationsAfterModal();
      });
      $('#geocoding-danger-modal').on('hidden.bs.modal', displayDestinationsAfterModal);
    } else {
      displayDestinations(data);
    }
  };

  var dialog_geocoding = scaffolds.bootstrap_dialog({
    title: I18n.t('destinations.index.dialog.geocoding.title'),
    icon: 'fa-refresh',
    message: SMT['modals/geocoding']({
      i18n: ajax.mustache_i18n
    })
  });

  $.ajax({
    url: '/destinations.json',
    beforeSend: ajax.beforeSendWaiting,
    success: checkForDisplayDestinations,
    complete: ajax.completeWaiting,
    error: ajax.ajaxError
  });
};

export const destinations_new = function(params, api) {
  destinations_form(params, api);
};

export const destinations_edit = function(params, api) {
  destinations_form(params, api);
};

Paloma.controller('Destinations', {
  new: function() {
    destinations_new(this.params, 'destinations');
  },
  create: function() {
    destinations_new(this.params, 'destinations');
  },
  edit: function() {
    destinations_edit(this.params, 'destinations');
  },
  update: function() {
    destinations_edit(this.params, 'destinations');
  },
  import: function() {
    destinations_import(this.params, 'destinations');
  },
  upload_csv: function() {
    destinations_import(this.params, 'destinations');
  },
  upload_tomtom: function() {
    destinations_import(this.params, 'destinations');
  },
  index: function() {
    destinations_index(this.params, 'destinations');
  }
});

Paloma.controller('Stores', {
  new: function() {
    destinations_new(this.params, 'stores');
  },
  create: function() {
    destinations_new(this.params, 'stores');
  },
  edit: function() {
    destinations_edit(this.params, 'stores');
  },
  update: function() {
    destinations_edit(this.params, 'stores');
  },
  import: function() {
    destinations_import(this.params, 'stores');
  },
  upload_csv: function() {
    destinations_import(this.params, 'stores');
  }
});