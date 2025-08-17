import { config } from "dotenv"

// Load environment variables from .env file if it exists
config()

import app from "./server"

const port = process.env.PORT || 3000
app.listen(port, () => {
  console.log(`server started on ${port}`);
});
