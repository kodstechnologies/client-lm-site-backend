import Joi from "joi";
import axios from 'axios';
import dotenv from 'dotenv'
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

import { AdminUser } from "../../models/AdminUseSchema.model.js";
import sendSMS from "../../services/sendSMS.js";

const emailVerificationSchema = Joi.object({
    email: Joi.string().email().required().messages({
        'string.email': 'Invalid email format',
        'any.required': 'Email is required',
    }),
    password: Joi.string().min(6).required().messages({
        'string.min': 'Password should have at least 6 characters',
        'any.required': 'Password is required',
    }),
});

export const emailVerify = async (req, res) => {
    const { error } = emailVerificationSchema.validate(req.body);
    if (error) {
        return res.status(400).json({ message: error.details[0].message });
    }

    const { email, password } = req.body;

    try {
        const user = await AdminUser.findOne({ email });
        if (!user) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        // Generate 6-digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const otpExpires = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

        // Save OTP and expiration
        user.otp = otp;
        user.otpExpiresAt = otpExpires;
        await user.save();

        // ✅ Send OTP via SMS
        const smsMessage = `${otp} is your OTP to complete your loan application with Little Money.`;
        await sendSMS(user.phoneNumber, smsMessage);

        // Respond to client
        const phoneHint = '****' + user.phoneNumber.slice(-4);
        console.log("🚀 ~ emailVerify ~ user.phoneNumber:", user.phoneNumber)
        console.log("🚀 ~ emailVerify ~ phoneHint:", phoneHint)
        
        return res.json({
            message: 'OTP sent to registered mobile number',
            phoneHint,
            email: user.email,
        });

    } catch (error) {
        console.error("Error in email verification:", error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};
