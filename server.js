const app = require("./api/server");
const PORT = 2006;

app.listen(PORT, () => {
  console.log(`Server running at  ${PORT}`);
});
