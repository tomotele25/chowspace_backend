const app = require("./api/server");
const PORT = 2005;

app.listen(PORT, () => {
  console.log(`Server running at  ${PORT}`);
});
