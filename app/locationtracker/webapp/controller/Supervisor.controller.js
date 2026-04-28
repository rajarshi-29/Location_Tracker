sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/m/MessageBox",
  "sap/m/MessageToast",
  "sap/ui/model/json/JSONModel",
  "sap/ui/core/UIComponent"
], function (Controller, MessageBox, MessageToast, JSONModel, UIComponent) {
  "use strict";

  return Controller.extend("com.locationtracker.locationtracker.controller.Supervisor", {
    onInit: function () {
      // Initialize supervisor model
      const oSupervisorModel = new JSONModel({
        activeDriversCount: 0,
        totalTripsCount: 0,
        completedTripsCount: 0,
        drivers: [],
        selectedDriver: {},
        selectedDriverTrips: []
      });

      this.getView().setModel(oSupervisorModel, "supervisor");

      // Get router and component
      this.oRouter = UIComponent.prototype.getRouterFor(this);
      this.oComponent = this.getOwnerComponent();

      // Check if user is authenticated and has supervisor role
      this._checkAuthentication();

      // Load drivers data
      this._loadDriversData();

      // Refresh data every 30 seconds
      setInterval(() => {
        this._loadDriversData();
      }, 30000);
    },

    _checkAuthentication: function () {
      const currentUser = JSON.parse(sessionStorage.getItem("currentUser") || "{}");
      
      if (!currentUser.username || currentUser.role !== "SUPERVISOR") {
        MessageBox.error("Unauthorized access. Supervisor/Admin role required.");
        this.oRouter.navTo("RouteLogin");
      }
    },

    _loadDriversData: function () {
      const oModel = this.getComponent().getModel();
      const oSupervisorModel = this.getView().getModel("supervisor");

      // Fetch all drivers with their active trips
      oModel.read("/Drivers", {
        success: (oData) => {
          const drivers = oData.results || [];
          
          oSupervisorModel.setProperty("/drivers", drivers);
          oSupervisorModel.setProperty("/activeDriversCount", 
            drivers.filter(d => d.status === "TRACKING").length
          );

          // Load additional statistics
          this._loadStatistics();

          // Auto-select first driver
          if (drivers.length > 0) {
            this._selectDriver(drivers[0]);
          }
        },
        error: (oError) => {
          console.error("Error loading drivers:", oError);
        }
      });
    },

    _loadStatistics: function () {
      const oModel = this.getComponent().getModel();
      const oSupervisorModel = this.getView().getModel("supervisor");

      // Fetch trip statistics
      oModel.read("/TripsStatistics", {
        success: (oData) => {
          if (oData) {
            oSupervisorModel.setProperty("/totalTripsCount", oData.totalTrips || 0);
            oSupervisorModel.setProperty("/completedTripsCount", oData.completedTrips || 0);
          }
        },
        error: (oError) => {
          console.error("Error loading statistics:", oError);
        }
      });
    },

    _selectDriver: function (oDriver) {
      const oSupervisorModel = this.getView().getModel("supervisor");
      oSupervisorModel.setProperty("/selectedDriver", oDriver);

      // Load driver's trips
      this._loadDriverTrips(oDriver.username);

      // Initialize map for this driver
      setTimeout(() => {
        this._initializeDriverMap(oDriver);
      }, 100);
    },

    _loadDriverTrips: function (driverUsername) {
      const oModel = this.getComponent().getModel();
      const oSupervisorModel = this.getView().getModel("supervisor");

      oModel.read("/Trips", {
        filters: [
          new sap.ui.model.Filter("driver_username", "EQ", driverUsername)
        ],
        success: (oData) => {
          const trips = oData.results || [];
          oSupervisorModel.setProperty("/selectedDriverTrips", trips);
        },
        error: (oError) => {
          console.error("Error loading driver trips:", oError);
        }
      });
    },

    _initializeDriverMap: function (oDriver) {
      // Initialize Leaflet map for driver tracking
      if (window.L && oDriver.lastLocation) {
        const mapContainer = document.getElementById("supervisorMapContainer");
        if (mapContainer && !this._supervisorMap) {
          this._supervisorMap = L.map("supervisorMapContainer").setView(
            [oDriver.lastLocation.latitude, oDriver.lastLocation.longitude],
            13
          );

          L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: "© OpenStreetMap contributors",
            maxZoom: 19
          }).addTo(this._supervisorMap);

          // Add marker for driver
          L.marker([oDriver.lastLocation.latitude, oDriver.lastLocation.longitude])
            .bindPopup(oDriver.fullName)
            .addTo(this._supervisorMap);
        } else if (this._supervisorMap && oDriver.lastLocation) {
          // Update map view
          this._supervisorMap.setView([oDriver.lastLocation.latitude, oDriver.lastLocation.longitude], 13);
        }
      }
    },

    onRefreshDrivers: function () {
      this._loadDriversData();
      MessageToast.show("Drivers data refreshed");
    },

    onExportReport: function () {
      MessageToast.show("Report export feature coming soon");
      // TODO: Implement report export functionality
    },

    onViewDriverMap: function (oEvent) {
      const oSource = oEvent.getSource();
      const oContext = oSource.getBindingContext("supervisor");
      const oDriver = oContext.getObject();
      
      this._selectDriver(oDriver);
      MessageToast.show("Showing map for " + oDriver.fullName);
    },

    onViewTripsHistory: function (oEvent) {
      const oSource = oEvent.getSource();
      const oContext = oSource.getBindingContext("supervisor");
      const oDriver = oContext.getObject();

      this._loadDriverTrips(oDriver.username);
      MessageToast.show("Loaded trip history for " + oDriver.fullName);
    },

    onLogout: function () {
      MessageBox.confirm("Are you sure you want to logout?", {
        title: "Logout",
        onClose: (sAction) => {
          if (sAction === MessageBox.Action.OK) {
            sessionStorage.removeItem("currentUser");
            localStorage.removeItem("rememberedUser");
            this.oRouter.navTo("RouteLogin");
            MessageToast.show("Logged out successfully");
          }
        }
      });
    }
  });
});
