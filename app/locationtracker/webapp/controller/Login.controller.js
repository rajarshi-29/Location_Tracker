sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/m/MessageBox",
  "sap/m/MessageToast",
  "sap/ui/model/json/JSONModel"
], function (Controller, MessageBox, MessageToast, JSONModel) {
  "use strict";

  return Controller.extend("com.locationtracker.locationtracker.controller.Login", {
    onInit: function () {
      const oLoginModel = new JSONModel({
        username: "",
        password: "",
        selectedRole: "DRIVER",
        rememberMe: false,
        errorMessage: "",
        roles: [
          {
            key: "DRIVER",
            text: "Driver",
            icon: "sap-icon://car"
          },
          {
            key: "SUPERVISOR",
            text: "Admin / Supervisor",
            icon: "sap-icon://manager"
          }
        ]
      });

      this.getView().setModel(oLoginModel, "login");

      // Check if user was remembered
      const rememberedUser = localStorage.getItem("rememberedUser");
      if (rememberedUser) {
        const user = JSON.parse(rememberedUser);
        oLoginModel.setProperty("/username", user.username);
        oLoginModel.setProperty("/selectedRole", user.role);
        oLoginModel.setProperty("/rememberMe", true);

        // Auto-focus password field
        setTimeout(() => {
          const oPasswordInput = this.getView().byId("passwordInput");
          if (oPasswordInput) {
            oPasswordInput.focus();
          }
        }, 100);
      }

      // Store reference to component and router
      this.oComponent = this.getOwnerComponent();
      this.oRouter = this.oComponent.getRouter();
    },

    onLogin: function () {
      const oLoginModel = this.getView().getModel("login");
      const username = oLoginModel.getProperty("/username");
      const password = oLoginModel.getProperty("/password");
      const role = oLoginModel.getProperty("/selectedRole");
      const rememberMe = oLoginModel.getProperty("/rememberMe");

      // Clear previous error
      oLoginModel.setProperty("/errorMessage", "");

      // Validation
      if (!username || !password) {
        oLoginModel.setProperty("/errorMessage", "Please enter username and password");
        return;
      }

      // Call backend authentication
      this._authenticate(username, password, role)
        .then((oUser) => {
          // Store user info in session storage
          sessionStorage.setItem("currentUser", JSON.stringify(oUser));

          // Store remembered user if checked
          if (rememberMe) {
            localStorage.setItem("rememberedUser", JSON.stringify({
              username: username,
              role: role
            }));
          } else {
            localStorage.removeItem("rememberedUser");
          }

          // Store user model globally
          const oUserModel = new JSONModel(oUser);
          this.oComponent.setModel(oUserModel, "user");

          MessageToast.show("Login successful! Welcome " + oUser.fullName);

          // Navigate to appropriate dashboard
          this.oRouter.navTo("RouteDashboard", {
            role: role
          });
        })
        .catch((error) => {
          oLoginModel.setProperty("/errorMessage", error.message || "Login failed. Please check your credentials.");
          MessageBox.error(error.message || "Authentication failed");
        });
    },

    _authenticate: function (username, password, role) {
      return new Promise((resolve, reject) => {
        const oComponent = this.getOwnerComponent();
        const oModel = oComponent.getModel();

        // Call backend authentication endpoint
        const oRequest = {
          username: username,
          password: password,
          role: role
        };

        oModel.create("/authenticate", oRequest, {
          success: (oData) => {
            if (oData && oData.username) {
              resolve({
                username: oData.username,
                fullName: oData.fullName,
                role: oData.role,
                email: oData.email,
                loginTime: new Date().toISOString()
              });
            } else {
              reject(new Error("Invalid response from server"));
            }
          },
          error: (oError) => {
            let errorMsg = "Authentication failed";
            if (oError.responseJSON && oError.responseJSON.error) {
              errorMsg = oError.responseJSON.error.message;
            }
            reject(new Error(errorMsg));
          }
        });
      });
    },

    onForgotPassword: function () {
      MessageBox.information(
        "Please contact your administrator to reset your password.",
        {
          title: "Password Reset",
          onClose: () => {
            // Could navigate to a password reset page
          }
        }
      );
    },

    onSignUp: function () {
      MessageBox.information(
        "Please contact your administrator to create a new user account.",
        {
          title: "Sign Up",
          onClose: () => {
            // Could navigate to a sign-up page
          }
        }
      );
    }
  });
});
