const createApp = require("./app");

const PORT = process.env.PORT || 3000;
const app = createApp();

app.listen(PORT, () => {
  console.log(`Device Fleet Monitor listening on port ${PORT}`);
});
