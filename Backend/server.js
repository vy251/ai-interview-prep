require('dotenv').config();
const app=require("./src/app");
const connectToDB=require("./src/config/database");
const invokeGeminiAI=require("./src/services/ai.service")

connectToDB();

app.listen(3000,()=>{
    console.log("server is running on port 3000")
})