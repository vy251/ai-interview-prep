const { Router } = require("express");
const authController = require("../controllers/auth.controller");
const authMiddleware = require("../middlewares/auth.middleware");
const authRouter = Router();

console.log("auth route loaded");

authRouter.post("/register", authController.registerUserController);

authRouter.post("/login", authController.loginUserController);

authRouter.get("/logout", authController.logoutUserController);

authRouter.get("/me",authMiddleware.authUser,authController.getMeController)

module.exports = authRouter;