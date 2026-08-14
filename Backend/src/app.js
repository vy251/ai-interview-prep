const express=require('express');
const cookieParser=require('cookie-parser');
const cors=require('cors');
const app=express();

app.use(express.json());
app.use(cookieParser());
app.use(cors({
    origin:"http://localhost:5173",
    credentials:true
}));

const authRouter=require("./routes/auth.routes");
const interviewRouter=require("./routes/interview.routes")
app.use("/api/auth",authRouter);
app.use("/api/interview",interviewRouter)

// Centralized error handler — must be defined LAST, after all routes.
// Any error passed via next(error) (or thrown in an async route handler,
// which Express 5 forwards automatically) ends up here instead of
// crashing with a raw stack trace.
app.use((err, req, res, next) => {
    console.error(err.stack)

    if (err.name === "ValidationError") {
        return res.status(400).json({
            message: err.message
        })
    }

    res.status(err.status || 500).json({
        message: err.message || "Something went wrong. Please try again."
    })
})

module.exports=app;