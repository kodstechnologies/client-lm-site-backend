import Joi from "joi";
import sendSMS from "../../services/sendSMS.js";
import otpModel from "../../models/otp.model.js";
import registerModel from "../../models/register.model.js";
import personalLoanModal from "../../models/personalLoan.modal.js";
import axios from 'axios';
import dotenv from 'dotenv'
import offerSchema from '../../models/offers.model.js'
import offersSummarySchema from "../../models/offerSummary.modal.js";
import jwt from 'jsonwebtoken';
import LoginCount from "../../models/loginCount.modal.js";
import appliedCustomersModal from "../../models/appliedCustomers.modal.js";
import { validate } from "node-cron";
import allDetailsModel from "../../models/allDetails.model.js";

dotenv.config();
// const apiKey = process.env.API_KEY;
// const apiUrl = process.env.API_BASE_URL;
const apiKey = process.env.API_KEY;


export const mobileVerify = async (req, res) => {
  const mobileVerifySchema = Joi.object({
    mobileNumber: Joi.string().required(),
  });

  const { error } = mobileVerifySchema.validate(req.body);
  if (error) {
    return res.status(400).json({ message: error.message });
  }

  const { mobileNumber } = req.body;

  try {
    if (mobileNumber) {
      const otp = Math.floor(100000 + Math.random() * 900000);
      console.log("🚀 ~ mobileVerify ~ otp:", otp)
      const message = `${otp} is your OTP to complete your loan application with Little Money`;

      await sendSMS(mobileNumber, message);

      const otpExpiry = Date.now() + 5 * 60 * 1000;
      console.log("🚀 ~ mobileVerify ~ otpExpiry:", otpExpiry);

      const otpDoc = await otpModel.findOneAndUpdate(
        { mobileNumber },
        { mobileNumber, otp, otpExpiry },
        { upsert: true, new: true }
      );

      console.log("✅ OTP record saved/updated:", otpDoc);
      console.log("OTP saved for:", mobileNumber);
      console.log("Generated OTP:", otp);

      return res.status(200).json({
        success: true,
        message: mobileNumber,
        // otp: otp, // (uncomment if you want to send otp back for testing)
      });
    }
  } catch (error) {
    console.error("Error in mobileVerify:", error);
    return res.status(500).json({ message: error.message || "Internal Server Error" });
  }
};



  export const verifyOtp = async (req, res) => {
    const schema = Joi.object({
      mobileNumber: Joi.string().required(),
      otp: Joi.string().required(),
    });

    const { error } = schema.validate(req.body);
    if (error) return res.status(400).json({ message: error.message });

    const { mobileNumber, otp } = req.body;

    try {
      const record = await otpModel.findOne({ mobileNumber });
      if (!record) {
        return res.status(400).json({ message: 'No OTP sent to this number' });
      }
      console.log("🚀 ~ verifyOtp ~ record:", record)

      if (Date.now() > Number(record.otpExpiry)) {
        return res.status(400).json({ message: 'OTP expired' });
      }

      if (record.otp == otp) {
        const apiInstance = axios.create({
          baseURL: process.env.API_BASE_URL,
          headers: {
            'apikey': process.env.API_KEY,
            'Content-Type': 'application/json',
          },
        });
        const dedupeResponse = await apiInstance.post(`/partner/dedupe`, { mobileNumber });

        if (dedupeResponse.data.success === "true") {
          let user = await registerModel.findOne({ mobileNumber });

          console.log("🚀 ~ verifyOtp ~ user:", user)
          if (user && user.leadId) {
            console.log("🚀 ~ verifyOtp ~ user.leadId:", user.leadId)
            user.existingLead = 'Y';
            await user.save();
          }
          if (!user) {
            user = new registerModel({ mobileNumber });
            await user.save();
          }

          let loginCountRecord = await LoginCount.findOne({ userId: user._id });

          console.log("🚀 ~ verifyOtp ~ loginCountRecord:", loginCountRecord)
          if (!loginCountRecord) {
            loginCountRecord = new LoginCount({ userId: user._id, count: 1 });
          } else {
            loginCountRecord.count += 1;
          }
          await loginCountRecord.save();
          const token = jwt.sign(
            { userId: user._id, mobileNumber: user.mobileNumber },
            process.env.JWT_SECRET,
            { expiresIn: "30m" }
          );

          //  Moved INSIDE the `if (dedupeResponse...)` block
          console.log("lid in registermodal", user.leadId);

          return res.status(200).json({
            success: true,
            message: "OTP verified successfully and dedupe called",
            token,
            userId: user._id,
            leadId: user.leadId,
            status: user.status,
            createdAt: user.createdAt
          });
        } else {
          return res.status(400).json({ success: false, message: "Dedupe API failed" });
        }
      }
      else {
        res.status(400).json({ message: "Invalid OTP please Check again." })
      }

    } catch (err) {
      console.error("Server error:", err);
      return res.status(500).json({ message: 'Server error during OTP verification' });
    }
  };

export const leadApi = async (req, res) => {
  // First, clean the request body to remove empty string fields
  const cleanedBody = Object.fromEntries(Object.entries(req.body).filter(([_, value]) => value !== ""))

  const personalLoanSchema = Joi.object({
    typeOfLoan: Joi.string().valid("personalloan", "businessloan").optional(),
    pan: Joi.string().required().strict(),
    mobileNumber: Joi.string().required(),
    firstName: Joi.string().required(),
    lastName: Joi.string().required(),
    email: Joi.string().email().required(),
    pincode: Joi.string().required(),
    dob: Joi.string().required(),
    monthlyIncome: Joi.number().required(),
    creditScoreClass: Joi.number().valid(1, 2).optional(),
    consumerConsentDate: Joi.date().required(),
    consumerConsentIp: Joi.string().required(),
    employmentStatus: Joi.number().valid(1, 2).required(),
    utm_id: Joi.string().optional(),
    referal: Joi.optional().allow(""),

    employerName: Joi.when("employmentStatus", {
      is: 1,
      then: Joi.string().required(),
      otherwise: Joi.forbidden(),
    }),
    officePincode: Joi.when("employmentStatus", {
      is: 1,
      then: Joi.string().required(),
      otherwise: Joi.forbidden(),
    }),

    businessRegistrationType: Joi.when("employmentStatus", {
      is: 2,
      then: Joi.number().valid(1, 2, 3, 4, 5, 6, 7, 8).required(),
      otherwise: Joi.forbidden(),
    }),

    residenceType: Joi.when("employmentStatus", {
      is: 2,
      then: Joi.when("businessRegistrationType", {
        is: Joi.valid(1, 2, 3, 4, 5, 6, 7),
        then: Joi.number().valid(1, 2).required(),
        otherwise: Joi.forbidden(),
      }),
      otherwise: Joi.forbidden(),
    }),

    businessCurrentTurnover: Joi.when("employmentStatus", {
      is: 2,
      then: Joi.when("businessRegistrationType", {
        is: Joi.valid(1, 2, 3, 4, 5, 6, 7),
        then: Joi.number().valid(1, 2, 3, 4).required(),
        otherwise: Joi.forbidden(),
      }),
      otherwise: Joi.forbidden(),
    }),

    businessYears: Joi.when("employmentStatus", {
      is: 2,
      then: Joi.when("businessRegistrationType", {
        is: Joi.valid(1, 2, 3, 4, 5, 6, 7),
        then: Joi.number().valid(1, 2, 3).required(),
        otherwise: Joi.forbidden(),
      }),
      otherwise: Joi.forbidden(),
    }),

    businessAccount: Joi.when("employmentStatus", {
      is: 2,
      then: Joi.when("businessRegistrationType", {
        is: Joi.valid(1, 2, 3, 4, 5, 6, 7),
        then: Joi.number().valid(1, 2).required(),
        otherwise: Joi.forbidden(),
      }),
      otherwise: Joi.forbidden(),
    }),
  })

  // Validate the cleaned request body
  const { error, value } = personalLoanSchema.validate(cleanedBody, { abortEarly: false })
  console.log("value", value)
  console.log("🚀 ~ leadApi ~ error:", error)

  if (error) {
    console.log("Validation error:", error.details)
    return res.status(400).json({
      message: "Validation Failed",
      errors: error.details.map((err) => err.message),
    })
  }

  try {
    const apiInstance = axios.create({
      baseURL: process.env.API_BASE_URL,
      headers: {
        apikey: process.env.API_KEY,
        "Content-Type": "application/json",
      },
    })

    const eligibilityResponse = await apiInstance.post("/v2/partner/create-lead", value)

    console.log("Raw API response:", eligibilityResponse.data)

    if (eligibilityResponse && eligibilityResponse.data && eligibilityResponse.data.success === "true") {
      const externalLeadId = eligibilityResponse.data.leadId

      if (!externalLeadId) {
        console.error("leadId missing in API response")
        return res.status(500).json({ success: false, message: "leadId missing in API response" })
      }

      const dataToStore = {
        ...value,
        leadId: externalLeadId,
      }

      console.log("Data to Store in DB:", JSON.stringify(dataToStore, null, 2))

      const leadDoc = await personalLoanModal.findOneAndUpdate(
        { mobileNumber: dataToStore.mobileNumber },
        { $set: dataToStore },
        { new: true, upsert: true },
      )

      console.log("Data successfully stored in DB:", leadDoc)

      await registerModel.findOneAndUpdate(
        { mobileNumber: dataToStore.mobileNumber },
        { $set: { leadId: externalLeadId } },
      )
      // Find the register doc
      const registerDoc = await registerModel.findOne({ mobileNumber: dataToStore.mobileNumber });

      // Find LoginCount using the register's _id
      let loginCountDoc = null;
      if (registerDoc) {
        loginCountDoc = await LoginCount.findOne({ userId: registerDoc._id });
      }

      // Find appliedCustomer using leadId
      const appliedCustomerDoc = await appliedCustomersModal.findOne({ leadId: externalLeadId });

      // Create AllDetails document
      await allDetailsModel.findOneAndUpdate(
        { leadId: externalLeadId },
        {
          $set: {
            personalLoanRef: leadDoc?._id || undefined,
            registerRef: registerDoc?._id || undefined,
            loginCountRef: loginCountDoc?._id || undefined,
            appliedCustomerRef: appliedCustomerDoc?._id || undefined,
          },
        },
        { new: true, upsert: true }
      );
      const allDetailsDoc = await allDetailsModel.findOne({ leadId: externalLeadId });
      console.log("✅ Stored AllDetails doc:", JSON.stringify(allDetailsDoc, null, 2));

      return res.status(200).json({
        success: true,
        message: "Lead created or updated successfully.",
        leadId: externalLeadId,
        userId: leadDoc._id,
      })
    } else {
      console.error("Eligibility API did not return success true", eligibilityResponse.data)
      return res.status(400).json({
        success: false,
        message: "Not eligible",
      })
    }
  } catch (err) {
    console.error("Error calling API:", err.response?.data || err.message || err)
    return res.status(500).json({ message: "Internal Server Error" })
  }
}

export const getOffersApi = async (req, res) => {
  const { leadId } = req.params;
  try {
    const axiosInstance = axios.create({
      baseURL: process.env.API_BASE_URL,
      headers: {
        'apikey': process.env.API_KEY,
        'Content-Type': 'application/json',
      },
    });
    const response = await axiosInstance.get(`/partner/get-offers/${leadId}`);
    // console.log("reasponse",response.data);
    // res.status(200).json(response.data);
    const data = response.data;
    if (data.success === "true" && Array.isArray(data.offers) && data.offers.length > 0) {
      // Replace existing document for that leadId
      await offerSchema.findOneAndUpdate(
        { leadId },
        { leadId, offers: data.offers },
        { upsert: true, new: true }
      );
      // await appliedCustomersModal.findByIdAndUpdate(
      //   {leadId},
      //   {lenderName}
      // )
    }

    res.status(200).json(data);

  } catch (error) {
    console.error('Error fetching offers:', error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      message: error.response?.data?.message || 'Failed to fetch offers',
    });
  }
};

export const getSummaryApi = async (req, res) => {
  const { leadId } = req.params;
  // console.log("req params",req.params);

  try {
    const axiosInstance = axios.create({
      baseURL: process.env.API_BASE_URL,
      headers: {
        'apikey': process.env.API_KEY,
        'Content-Type': 'application/json',
      },
    });

    const response = await axiosInstance.get(`/partner/get-summary/${leadId}`);
    const summaryData = response.data;
    // console.log(summaryData);


    if (summaryData.success) {
      const {
        offersTotal,
        maxLoanAmount,
        minMPR,
        maxMPR,
      } = summaryData.summary;
      const redirectionUrl = summaryData.redirectionUrl;

      // Save to DB (create or update if already exists)
      const saved = await offersSummarySchema.findOneAndUpdate(
        { leadId }, // find by leadId
        { leadId, offersTotal, maxLoanAmount, minMPR, maxMPR, redirectionUrl }, // update fields
        { upsert: true, new: true } // create if not exists
      );

      res.status(200).json(summaryData);
    } else {
      res.status(400).json({ success: false, message: 'API did not return success' });
    }

  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch and save summary' });
  }
}
export const saveAppliedCustomers = async (req, res) => {
  const appliedCustomersSchema = Joi.object({
    leadId: Joi.string().required(),
    lenderName: Joi.string().required(),
  });

  const { error, value } = appliedCustomersSchema.validate(req.body, { abortEarly: false });

  if (error) {
    console.log("Validation error:", error.details);
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: error.details.map(err => err.message)
    });
  }

  const { leadId, lenderName } = value; // safe to destructure now

  try {
    const newApplied = new appliedCustomersModal({
      leadId: value.leadId,
      lenderName: value.lenderName
    });
    await newApplied.save();

    res.status(200).json({
      success: true,
      message: "Application saved successfully"
    });
  } catch (err) {
    console.error("Error saving application:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const updateProfile = async (req, res) => {
  try {
    const { leadId } = req.params;

    const updatedProfile = await personalLoanModal.findOneAndUpdate(
      { leadId }, // Match based on leadId
      { $set: req.body }, // Update with incoming data
      { new: true } // Return the updated document
    );

    if (!updatedProfile) {
      return res.status(404).json({ message: "Profile not found" });
    }

    res.status(200).json({ message: "Profile updated", profile: updatedProfile });
  } catch (error) {
    console.error("Update error:", error);
    res.status(500).json({ message: "Something went wrong", error });
  }
}


export const getPersonalDetailsById = async (req, res) => {
  const { leadId } = req.params;
  console.log("🚀 ~ getPersonalDetailsById ~ leadId:", leadId)
  try {
    const lead = await personalLoanModal.findOne({ leadId }); //  Here

    console.log("🚀 ~ getPersonalDetailsById ~ lead:", lead)
    if (!lead) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }

    return res.status(200).json(lead);
  } catch (error) {
    console.error('Error fetching lead:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

//dummy push on 07 may