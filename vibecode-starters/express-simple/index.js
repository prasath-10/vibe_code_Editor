const express = require("express");
const app = express();

app.get("/", (req, res) => {
  res.send("Hello Express Template");
});

app.listen(3000, () => {
  console.log("Server running");
});
