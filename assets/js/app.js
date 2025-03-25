const app = {
  urlParams: {},
  bounds: new google.maps.LatLngBounds(),
  infoWindow: new google.maps.InfoWindow({
    pixelOffset: new google.maps.Size(0, -5),
    disableAutoPan: true
  }),
  geocoder: new google.maps.Geocoder(),
  autocomplete: new google.maps.places.Autocomplete((document.getElementById("search")), {
    types: ["geocode"]
  }),
  deckOverlay: new deck.GoogleMapsOverlay({}),

  init: function() {
	console.log("* Begin init");
    this.resize();
    this.bindUIActions();
    this.loadURLparams();
    this.buildMap();
    this.initLocationCtrl();

    $(window).resize(function () {
      app.resize();
    });

    $(".navbar-collapse").on("hidden.bs.collapse", function () {
      app.resize();
    });
  },

  resize: function() {
	  console.log("* Begin resize");
    $("body").css("padding-top", $(".navbar").css("height"));
    google.maps.event.trigger(map, "resize");
    $("#table").bootstrapTable("resetView", {
      height: $("#table-container").height()
    });
  },

  bindUIActions: function() {
	  console.log("* Begin bindUIActions");
    $("#refresh-btn").click(function() {
      app.refreshData();
      $(".navbar-collapse").collapse("hide");
      return false;
    });
    
    $("#extent-btn").click(function() {
      app.map.fitBounds(app.bounds);
      $(".navbar-collapse").collapse("hide");
      return false;
    });

    $("#legend-btn").click(function() {
      $("#legend-modal").modal("show");
      $(".navbar-collapse").collapse("hide");
      return false;
    });

    $("#directions-btn").click(function() {
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${app.selectedFeature.geometry.coordinates[1]},${app.selectedFeature.geometry.coordinates[0]}`);
    });

    $("[name='view']").click(function() {
      if (this.id === "split-view-btn") {
        app.switchView("split", true);
        return false;
      } else if (this.id === "map-view-btn") {
        app.switchView("map", true);
        return false;
      } else if (this.id === "table-view-btn") {
        app.switchView("table", true);
        return false;
      }
    });

    $(document).on("click", "#infoWindow", function(){
      app.clickFeature(app.selectedFeature);
    });
  },

  loadURLparams: function() {
	  console.log("* Begin loadURLparams");
    app.urlParams = new URLSearchParams(window.location.search);

    if (app.urlParams.has("id")) {
      let token = app.urlParams.get("id");
      app.geojsonURL = `https://fulcrumapp.io/share/${token}/geojson`;
      if (app.urlParams.has("repeatable")) {
        app.geojsonURL += `?repeatable=${app.urlParams.get("repeatable")}`
      }
      app.fetchData(app.geojsonURL);
      app.setDownloadLinks(app.geojsonURL);
    } else {
      let token = prompt("Please enter a Fulcrum view share ID:");
      if (token != null) {
        app.geojsonURL = `https://fulcrumapp.io/share/${token}/geojson`;
        app.fetchData(app.geojsonURL);
        app.setDownloadLinks(app.geojsonURL);
      }
      return false;
    }

    if (app.urlParams.has("view")) {
      const view = app.urlParams.get("view");
      if (["split", "map", "table"].indexOf(view) !== -1) {
        app.switchView(view, false);
      }
    }
  },

  setDownloadLinks(url) {
    $("#url-geojson").attr("href", url);
    $("#url-csv").attr("href", url.replace("geojson", "csv"));
    $("#url-kml").attr("href", url.replace("geojson", "kml"));
  },

  refreshData: function() {
    app.fetchData(app.geojsonURL);
  },

  buildMap: function() {
	  console.log("* Begin buildMap");
    app.map = new google.maps.Map(document.getElementById("map"), {
      center: {lat: 0, lng: 0},
      zoom: 0,
      fullscreenControl: false,
      zoomControl: false,
      mapTypeControl: true,
      controlSize: 28,
      gestureHandling: "greedy",
      mapId: "3c735ed845300bc8"
    });

    app.deckOverlay.setMap(app.map);

    app.map.addListener("click", function(event) {
      $("input").is(":focus") ? $("input").blur() : null;
      app.infoWindow.close();
    });

    app.map.addListener("dragstart", function(event) {
      $("input").is(":focus") ? $("input").blur() : null;
    });

    app.autocomplete.addListener("place_changed", function() {
      const place = this.getPlace();
      if (place) {
        app.placeChanged(place);
      }
    });

    app.autocomplete.bindTo("bounds", app.map);
  },

  buildLayer: function(geojson, zoom) {
    if (geojson.features.length > 0) {
      const locationFeatures = geojson.features.filter(function (feature) {
        return !feature.geometry.coordinates.includes(null);
      });

      geojson = {
        "type": "FeatureCollection",
        "features": locationFeatures
      };

      if (locationFeatures.length > 0) {
        const extent = geojsonExtent(geojson);
        app.bounds = new google.maps.LatLngBounds({lat: extent[1], lng: extent[0]}, {lat: extent[3], lng: extent[2]});
        if (zoom) {
          app.map.fitBounds(app.bounds);
        }
      } else {
        app.switchView("table", false);
      }
      
      function getRGB(value) {
        let rgb = value.match(/[A-Za-z0-9]{2}/g);
        rgb = rgb.map(v => parseInt(v, 16));
        return rgb;
      }

      function setTooltip({x, y, object, coordinate}) {
        if (object) {
          app.map.setOptions({
            draggableCursor: "pointer"
          });
          if (object.properties && object.properties["_title"]) {
            app.infoWindow.setPosition({lat: object.geometry.coordinates[1], lng: object.geometry.coordinates[0]});
            app.infoWindow.setContent(object.properties["_title"]);
            if (!app.infoWindow.getMap()) {
              app.infoWindow.open(app.map);
              $(".gm-style-iw, .gm-style-iw-c").css("border-left", `5px solid ${object.properties["marker-color"]}`);
            }
          }
        } else {
          app.infoWindow.close();
          app.map.setOptions({
            draggableCursor: null
          });
        }
      }
      
      function getInfo({x, y, object}) {
        app.clickFeature(object);
      }
      
      const geojsonLayer = new deck.GeoJsonLayer({
        id: "geojson",
        data: geojson,
        filled: true,
        stroked: true,
        opacity: 0.8,
        pointRadiusUnits: "pixels",
        getPointRadius: 5,
        getFillColor: d => getRGB(d.properties["marker-color"]),
        getLineColor: [0, 0, 0],
        lineWidthUnits: "pixels",
        lineWidthMaxPixels: 5,
        getLineWidth: 1,
        pickable: true,
        highlightColor: [0, 255, 255, 0.75 * 255],
        autoHighlight: false,
        onHover: setTooltip,
        onClick: getInfo
      });

      app.deckOverlay.setProps({layers: [geojsonLayer]});
    } else {
      app.deckOverlay.setProps({layers: []});
    }
  },

  initLocationCtrl: function() {
	  console.log("* Begin initLocationCtrl");
    let watchId = null;

    const locationMarker = new google.maps.Marker({
      map: app.map,
      clickable: false,
      visible: false,
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 6,
        fillColor: "#3a84df",
        fillOpacity: 0.9,
        strokeColor: "#fff",
        strokeWeight: 2
      }
    });

    const locationCircle = new google.maps.Circle({
      map: app.map,
      clickable: false,
      visible: false,
      radius: 1,
      strokeColor: "#3a84df",
      strokeOpacity: 0.8,
      strokeWeight: 0.5,
      fillColor: "#3a84df",
      fillOpacity: 0.10
    });

    const geolocationBtn = document.createElement("div");
    geolocationBtn.id = "geolocationBtn";
    geolocationBtn.style.cssText = "background-color:#fff;border:2px solid #fff;border-radius 3px;box-shadow:rgba(0,0,0,0.3) 0px 1px 4px -1px;margin-right:7px;cursor:pointer;border-radius:2px;padding:3px;";
    geolocationBtn.index = 1;

    const geolocationIcon = document.createElement("div");
    geolocationIcon.id = "geolocationIcon";
    geolocationIcon.style.cssText = "background-size:36px 18px;width:18px;height:18px;opacity:0.9;background-image:url(assets/img/geolocation.png);";

    geolocationBtn.appendChild(geolocationIcon);

    google.maps.event.addDomListener(geolocationBtn, "click", function() {
      if (navigator.geolocation) {
        if (locationMarker.getVisible()) {
          locationMarker.setVisible(false);
          locationCircle.setVisible(false);
          navigator.geolocation.clearWatch(watchId);
          geolocationIcon.style.backgroundPosition = "";
        } else {
          locationMarker.setVisible(true);
          locationCircle.setVisible(true);
          geolocationIcon.style.backgroundPosition = "-18px";
          navigator.geolocation.getCurrentPosition(function(position){
            locationUpdate(position);
            app.map.fitBounds(locationCircle.getBounds());
            watchId = navigator.geolocation.watchPosition(locationUpdate, geolocationError, {enableHighAccuracy: true});
          }, geolocationError, {enableHighAccuracy: true});
        }
      } else {
        alert("Error: Your browser doesn't support geolocation.");
      }
    });

    function geolocationError(error) {
      alert("Error: " + error.message);
      locationMarker.setVisible(false);
      locationCircle.setVisible(false);
    }

    function locationUpdate(position){
      const latLng = new google.maps.LatLng(position.coords.latitude, position.coords.longitude);
      locationMarker.setPosition(latLng);
      locationCircle.setCenter(latLng);
      locationCircle.setRadius(position.coords.accuracy);
    }

    app.map.controls[google.maps.ControlPosition.RIGHT_BOTTOM].push(geolocationBtn);
  },

  clickFeature: function(feature) {
    let content = "<table class='table table-striped table-bordered table-sm' style='margin-bottom: 0px'>";
    $.each(feature.properties, function(prop, val) {
      if (prop !== "marker-color" && prop !== "_title") {
        val = app.formatProperty(val, null, null, `properties.${prop}`);
        if (val) {
          content += `<tr>
                        <th>${prop.toUpperCase().replace(/_/g, " ")}</th>
                        <td style="${prop == '_status' ? 'box-shadow: inset 10px 0em ' + feature.properties["marker-color"] + '; padding-left: 18px' : ''}">${val}</td>
                      </tr>`;
        }
      }
    });
    content += "</table>";
    $("#feature-title").html(feature.properties._title ? feature.properties._title : "Feature Info");
    $("#feature-info").html(content);
    $("#feature-modal").modal("show");
    app.urlParams.set("id", feature.id);
  },

  placeChanged: function(place) {
    if (place && place.geometry) {
      app.map.setCenter(place.geometry.location);
      app.map.setZoom(18);
      if (place.geometry.viewport) {
        app.map.fitBounds(place.geometry.viewport);
      }
      app.infoWindow.setPosition(place.geometry.location);
      app.infoWindow.setContent(`<div class='text-center'><strong>${place.formatted_address}</strong><div class='place-coordinates'>${place.geometry.location.lat().toFixed(6)}, ${place.geometry.location.lng().toFixed(6)}</div></div>`);
      app.infoWindow.open(app.map);
    } else if (place.name) {
      app.geocodeAddress(place.name);
    }
    $(".navbar-collapse").collapse("hide");
  },

  geocodeAddress: function(address) {
    app.geocoder.geocode({
      "address": address
    }, function(results, status) {
      if (status === "OK") {
        app.map.setCenter(results[0].geometry.location);
        app.map.setZoom(18);
        if (results[0].geometry.bounds) {
          app.map.fitBounds(results[0].geometry.bounds);
        }
        app.infoWindow.setPosition(results[0].geometry.location);
        app.infoWindow.setContent(results[0].formatted_address);
        app.infoWindow.open(app.map);
      } else {
        alert(`Geocode was not successful for the following reason:  ${status}`);
      }
    });
    $(".navbar-collapse").collapse("hide");
  },

  fetchData: function(url) {
    let columns = [];
    $.ajax({
      type: "GET",
      url: url,
      cache: false,
      success: function(geojson, status, xhr) {

        for (let i = 0; i < geojson.features.length; i++) {
          const feature = geojson.features[i];
          if (!feature.geometry) {
            geojson.features.splice(i, 1);
            i--;
          }

          if (app.urlParams.has("repeatable")) {
            const properties = geojson.features[i].properties;
            geojson.features[i].properties = Object.fromEntries(Object.entries(properties).filter(function ([key]) {
              return !(key.startsWith("_")) || key.startsWith("_title");
            }))
          }
        }
        
        columns = Object.keys(geojson.features[0].properties);
        columns = columns.map(function(column) {
          return ({
            field: `properties.${column}`,
            title: column.toUpperCase().replace(/_/g, " "),
            sortable: true,
            align: column.endsWith("_url") ? "center" : "left",
            valign: "middle",
            visible: (column == "marker-color") ? false : true,
            formatter: app.formatProperty,
            cellStyle: app.styleCell
          });
        });
      },
      error: function(jqXHR) {
        if (jqXHR.status == 401) {
          alert("Invalid Fulcrum view share ID!")
        }
      }
    }).done(function(geojson) {
      if (geojson.fulcrum) {
        if (geojson.fulcrum.view_name) {
          $("[name='title']").html(geojson.fulcrum.view_name);
        }
        if (geojson.fulcrum.status_field) {
          app.buildLegend(geojson.fulcrum.status_field);
        }
      }
      app.buildLayer(geojson, true);
      app.buildTable(columns, geojson);
    });
    
  },

  buildLegend: function(statusField) {
    $("#legend-item").attr("hidden", null);
    $("#legend-title").html(statusField.label);
    $("#legend").empty();
    $.each(statusField.choices, function(index, value) {
      $("#legend").append("<p><i style='background:" + value.color + "'></i> " + value.label + "</p>");
    });
  },

  buildTable: function(columns, geojson) {
    $("#table").bootstrapTable({
      cache: false,
      classes: "table table-bordered table-hover table-sm",
      toolbar: "#toolbar",
      toolbarAlign: "right",
      buttonsClass: "light",
      height: $("#table-container").height(),
      undefinedText: "",
      striped: false,
      pagination: false,
      minimumCountColumns: 1,
      sortOrder: "asc",
      search: true,
      trimOnSearch: false,
      searchAlign: "left",
      // searchOnEnterKey: true,
      showColumns: true,
      showToggle: false,
      buttonsAlign: "left",
      columns: columns,
      data: geojson,
      dataField: "features",
      onPostBody: function(data) {
        $("#table").off("mouseover");
        // $("#table").off("mouseout");
        $("#table").on("mouseover", "tbody tr", function() {
          const feature = data[$(this).index()];
          if (feature.properties["_title"] && !feature.geometry.coordinates.includes(null)) {
            app.infoWindow.setContent(`<div id="infoWindow">${feature.properties["_title"]}</div>`);
            app.infoWindow.setPosition({
              lat: feature.geometry.coordinates[1],
              lng: feature.geometry.coordinates[0]
            });
            app.infoWindow.open(app.map);
            $(".gm-style-iw, .gm-style-iw-c").css("border-left", `5px solid ${feature.properties["marker-color"]}`);
          } else {
            app.infoWindow.close();
          }
        });

        // $("#table").on("mouseout", "tbody tr", function() {
        //   app.infoWindow.close();
        // });
      },
      onClickRow: function(row, $element) {
        app.selectedFeature = row;
        if (!row.geometry.coordinates.includes(null)) {
          app.zoomToFeature(row.geometry.coordinates[1], row.geometry.coordinates[0]);
          if (app.map.getStreetView().getVisible()) {
            app.map.getStreetView().setPosition({
              lat: row.geometry.coordinates[1],
              lng: row.geometry.coordinates[0]
            });
          }
        }
      },
      onDblClickRow: function(row) {
        app.clickFeature(row);
      },
      onSearch: function(text) {
        const features = $("#table").bootstrapTable("getData");
        const geojson = {
          type: "FeatureCollection",
          features: features
        };
        app.buildLayer(geojson, false);
        $("#feature-count").html(geojson.features.length);
      }
    });

    $(".search input").attr("placeholder", "Filter Records");
    $("#feature-count").html(geojson.features.length);
    $("#total-count").html(geojson.features.length);
  },

  zoomToFeature: function(lat, lng) {
    app.map.setCenter({
      lat: lat,
      lng: lng,
    })
    app.map.setZoom(18);
  },

  formatProperty: function(value, row, index, field) {
    if (!value) {
      value = "";
    }
    else if (Array.isArray(value)) {
      const count = value.length;
      if (value[0] && value[0].includes("photo")) {
        value = `<button type='button' class='btn btn-secondary btn-sm' onclick='app.photoGallery("${value.join(", ")}");' title='View photos'>${count} Photo${count > 1 ? 's' : ''}</button>`;
      } else if (value[0] && value[0].includes("video")) {
        value = `<button type='button' class='btn btn-secondary btn-sm' onclick='app.videoGallery("${value.join(", ")}");' title='View videos'>${count} Video${count > 1 ? 's' : ''}</button>`;
      } else if (value[0] && value[0].includes("audio")) {
        value = `<button type='button' class='btn btn-secondary btn-sm' onclick='app.audioGallery("${value.join(", ")}");' title='View audio'>${count} Audio${count > 1 ? 's' : ''}</button>`;
      } else if (value[0] && value[0].includes("/v2/file")) {
        value = value.map((attach, i) => `<a href='${attach}'> Attachment ${i} </a>`);
      }
    }
    else if (typeof value == "string") {
      if (value.startsWith("http")) {
        if (value.includes("signature")) {
          value = `<button type='button' class='btn btn-secondary btn-sm' onclick='app.signatureGallery("${value}");' title='View signature'> Signature</button>`;
        } else {
          value = `<a href='${value}' target='_blank'>${value}</a>`;
        }
      } else if (field == "properties._created_at" || field == "properties._updated_at" || field == "properties._server_created_at" || field == "properties._server_updated_at") {
        value = new Date(value).toLocaleString();
      } else if (new Date(value) !== "Invalid Date" && !isNaN(new Date(value)) && value == new Date(value).toISOString()) {
        value = value.endsWith("T00:00:00.000Z") ? new Date(value).toLocaleDateString() : new Date(value).toLocaleString();
      }
    }
    return value;
  },

  photoGallery: function (photos) {
    const photoArray = photos.split(", ").map(function (photo) {
      return {src: photo}
    });
    $.fancybox.open(photoArray);
    return false;
  },

  videoGallery: function (videos) {
    const videoArray = videos.split(", ").map(function (video) {
      return {src: video, type: "iframe"}
    });
    $.fancybox.open(videoArray);
    return false;
  },

  audioGallery: function (audios) {
    const audioArray = audios.split(", ").map(function (audio) {
      return {src: audio, type: "iframe"}
    });
    $.fancybox.open(audioArray);
    return false;
  },

  signatureGallery: function (signature) {
    $.fancybox.open({src: signature});
    return false;
  },

  styleCell: function(value, row, index, field) {
    if ((row.properties.hasOwnProperty("_status") && field == "properties._status") || (!row.properties.hasOwnProperty("_status") && row.properties.hasOwnProperty("_title") && field == "properties._title")) {
      return {
        css: {
          "box-shadow": "inset 10px 0em " + row.properties["marker-color"],
          "padding-left": "18px"
        }
      };
    }
    else {
      return {};
    }
  },

  switchView: function(view, button) {
    if (view == "split") {
      $("#table-container").show().css("height", "60%");
      $("#map-container").show().css("height", "40%");
      $(window).resize();
    } else if (view == "map") {
      $("#map-container").show().css("height", "100%");
      $("#table-container").hide();
      $(window).resize();
    } else if (view == "table") {
      $("#table-container").show().css("height", "100%");
      $("#map-container").hide();
      $(window).resize();
    }
    if (button) {
      app.urlParams.set("view", view);
      window.history.replaceState(null, null, `?${app.urlParams.toString()}`);
      $("#view-dropdown").dropdown("toggle");
      $(".navbar-collapse").removeClass("show");
    }
    app.resize();
  }
};

$(document).ready(function() {
  console.log("* Calling app.init");
  app.init();
  $("#search").keydown(function(event){
    if (event.keyCode == 13) {
      event.preventDefault();
      return false;
    }
  });
});

$(document).ajaxComplete(function(){
  $("#loading").hide();
});
