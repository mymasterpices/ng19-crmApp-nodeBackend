const moongoose = require("mongoose");

const userSchema = new moongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
    },
    password: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
    role: {
      type: String,
      enum: ["superadmin", "admin", "user", "karigar"],
      default: "user",
    },
  },
  { timestamps: true },
);

module.exports = moongoose.model("User", userSchema);
