const userModel=require("../models/user.model");
const bcrypt=require("bcryptjs");
const jwt=require("jsonwebtoken");
const tokenBlacklistModel=require("../models/blacklist.model");

// Cross-origin cookie settings for production (frontend and backend live on
// different Render subdomains). In dev (localhost, same-site) "lax" +
// non-secure works fine since Render/production is served over HTTPS.
const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    maxAge: 24 * 60 * 60 * 1000 // 1 day, matches JWT expiresIn
}

async function registerUserController(req,res){
    try{ 
    const {username,email,password}=req.body;
    if(!username || !email || !password){
        return res.status(400).json({message:"Please provide username,email and password"})
    }
    const isUserAlreadyExists=await userModel.findOne({
        $or:[{username},{email}]
    })
    if(isUserAlreadyExists){
        return res.status(400).json({message:"User already exists"})
    }
    // Continue with user registration logic here
    const hash=await bcrypt.hash(password,10)

    const user=await userModel.create({
        username,
        email,
        password:hash
    })
    const token=jwt.sign(
        {
            id:user._id,
            username:user.username
        },
        process.env.JWT_SECRET,
        { expiresIn: '1d' }
    )
    res.cookie("token",token,cookieOptions)

    res.status(201).json({
        message:"User registered successfully",
        user:{
            id:user._id,
            username:user.username,
            email:user.email
        }
    })
    }
    catch (error) {
        res.status(500).json({
            message: error.message
        });
    }
}
async function loginUserController(req,res,next){
    try {
        const {email,password}=req.body;

        const user=await userModel.findOne({email});

        if(!user){
            return res.status(400).json({message:"Invalid email or password"});
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);

        if(!isPasswordValid){
            return res.status(400).json({message:"Invalid email or password"});
        }

        const token=jwt.sign(
            {
                id:user._id,
                username:user.username
            },
            process.env.JWT_SECRET,
            { expiresIn:'1d' }
        );

        res.cookie("token",token,cookieOptions);

        res.status(200).json({
            message:"User logged in successfully",
            user:{
                id:user._id,
                username:user.username,
                email:user.email
            }
        });
    } catch (error) {
        next(error)
    }
}

async function logoutUserController(req,res){
    try {
        const token=req.cookies.token;
        if(token){
            await tokenBlacklistModel.create({token});
        }
        res.clearCookie("token",cookieOptions);
        res.status(200).json({message:"User logged out successfully"});
    } catch (error) {
        res.status(500).json({message:error.message});
    }
}

async function getMeController(req,res){
    const user= await userModel.findById(req.user.id)
    res.status(200).json({
        message:"User details fetched succressfully",
        user:{
            id:user._id,
            username:user.username,
            email:user.email
        }
    })
}
module.exports={
    registerUserController,
    loginUserController,
    logoutUserController,
    getMeController
}