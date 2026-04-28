sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/m/MessageBox",
  "sap/ui/model/json/JSONModel"
], function (Controller, MessageBox, JSONModel) {
  "use strict";

  return Controller.extend("com.locationtracker.locationtracker.controller.Dashboard", {
    onInit: function () {
      this.oRouter = this.getOwnerComponent().getRouter();
      this.oComponent = this.getOwnerComponent();

      // Check authentication status
      const currentUser = JSON.parse(sessionStorage.getItem("currentUser") || "{}");
      
      if (!currentUser.username) {
        // Not authenticated, redirect to login
        this.oRouter.navTo("RouteLogin");
        return;
      }

      // Route based on user role
      if (currentUser.role === "SUPERVISOR") {
        this.oRouter.navTo("RouteSupervisor");
      } else if (currentUser.role === "DRIVER") {
        this.oRouter.navTo("RouteDriver");
      } else {
        MessageBox.error("Unknown user role");
        this.oRouter.navTo("RouteLogin");
      }
    }
  });
});
