import express from "express";
import {  verifyOtp } from "../controller/web/personalLoanController.js";
import { emailVerify } from '../controller/web/adminAuthController.js'
const router = express.Router();

router.post('/email-verify', emailVerify)
router.post('/otp-verify', verifyOtp)
export default router;