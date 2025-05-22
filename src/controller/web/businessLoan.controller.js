import Joi from "joi";
import axios from 'axios';
import dotenv from 'dotenv'
import jwt from 'jsonwebtoken';
import businessLoanModal from "../../models/businessLoan.modal.js";
import registerModel from "../../models/register.model.js";
import allDetailsModel from "../../models/allDetails.model.js";
import LoginCount from "../../models/loginCount.modal.js";
import appliedCustomersModal from "../../models/appliedCustomers.modal.js";


dotenv.config()
export const leadApiBusinessLoan = async (req, res) => {
    const businessLoanSchema = Joi.object({
        mobileNumber: Joi.string().required(),
        firstName: Joi.string().required(),
        lastName: Joi.string().required(),
        email: Joi.string().email().required(),
        pincode: Joi.string().required(),
        pan: Joi.string().required(),
        consumerConsentDate: Joi.date().required(),
        consumerConsentIp: Joi.string().required(),
        businessRegistrationType: Joi.number().valid(1, 2, 3, 4, 5, 6, 7, 8).required(),
        referal: Joi.string().allow('', null).optional(),

        // Conditional fields
        // city: Joi.when('businessRegistrationType', {
        //     not: 8,
        //     then: Joi.string().required(),
        //     otherwise: Joi.forbidden()
        // }),
        dob: Joi.string().required(),

        employmentStatus: Joi.number().valid(1, 2).required(),

        // employmentStatus: Joi.when('businessRegistrationType', {
        //     is: 8,
        //     then: Joi.number().valid(1, 2).required(),
        //     otherwise: Joi.forbidden()
        // }),
        businessProof: Joi.number().valid(1, 2, 3, 4, 5, 6, 7, 8).optional(),

        businessCurrentTurnover: Joi.when('businessRegistrationType', {
            is: Joi.valid(1, 2, 3, 4, 5, 6, 7),
            then: Joi.number().valid(1, 2, 3, 4).optional(),
            // otherwise: Joi.when('employmentStatus', {
            //     is: 2,
            //     then: Joi.number().valid(1, 2, 3, 4).required(),
            //     otherwise: Joi.forbidden()
            // })
        }),

        businessYears: Joi.when('businessRegistrationType', {
            is: Joi.valid(1, 2, 3, 4, 5, 6, 7),
            then: Joi.number().valid(1, 2, 3).optional(),
            // otherwise: Joi.when('employmentStatus', {
            //     is: 2,
            //     then: Joi.number().valid(1, 2).required(),
            //     otherwise: Joi.forbidden()
            // })
        }),

        businessAccount: Joi.when('businessRegistrationType', {
            is: Joi.valid(1, 2, 3, 4, 5, 6, 7),
            then: Joi.number().valid(1, 2).optional(),
            // otherwise: Joi.when('employmentStatus', {
            //     is: 2,
            //     then: Joi.number().valid(1, 2).required(),
            //     otherwise: Joi.forbidden()
            // })
        }),

        residenceType: Joi.when('businessRegistrationType', {
            is: Joi.valid(1, 2, 3, 4, 5, 6, 7),
            then: Joi.number().valid(1, 2).optional(),
            // otherwise: Joi.when('employmentStatus', {
            //     is: 2,
            //     then: Joi.number().valid(1, 2).required(),
            //     otherwise: Joi.forbidden()
            // })
        }),

        employerName: Joi.when('employmentStatus', {
            is: 1,
            then: Joi.string().required(),
            otherwise: Joi.forbidden()
        }),

        officePincode: Joi.when('employmentStatus', {
            is: 1,
            then: Joi.string().required(),
            otherwise: Joi.forbidden()
        }),

        monthlyIncome: Joi.number().required(),
        leadId: Joi.string().optional()
    });
    const { error, value } = businessLoanSchema.validate(req.body, { abortEarly: false });

    console.log("🚀 ~ leadApiBusinessLoan ~ value:", value)
    console.log("🚀 ~ leadApiBusinessLoan ~ error:", error)
    if (error) {
        return res.status(400).json({
            message: "Validation Failed",
            errors: error.details.map(err => err.message)
        });
    }
    try {
        const apiInstance = axios.create({
            baseURL: process.env.API_BASE_URL,
            headers: {
                'apikey': process.env.API_KEY,
                'Content-Type': 'application/json',
            }
        });

        const eligibilityResponse = await apiInstance.post('v2/partner/create-lead', value);
        console.log("Eligibility API response:", eligibilityResponse.data);

        if (eligibilityResponse.data.success === "true") {
            const externalLeadId = eligibilityResponse.data.leadId;
            console.log("🚀 ~ leadApiBusinessLoan ~ externalLeadId:", externalLeadId)
            if (!externalLeadId) {
                return res.status(500).json({ success: false, message: 'leadId missing in API response' });
            }

            const { ...dataToStore } = value;

            let existingLead = await businessLoanModal.findOne({ mobileNumber: dataToStore.mobileNumber });

            console.log("🚀 ~ leadApiBusinessLoan ~ existingLead:", existingLead)
            let leadDoc;
            if (existingLead) {
                existingLead = await businessLoanModal.findOneAndUpdate(
                    { mobileNumber: dataToStore.mobileNumber },
                    { ...dataToStore, leadId: externalLeadId },
                    { new: true }
                );
                leadDoc = existingLead;


            } else {
                const newLead = new businessLoanModal({
                    ...dataToStore,
                    leadId: externalLeadId
                });
                console.log("🚀 ~ leadApiBusinessLoan ~ newLead:", newLead)
                leadDoc = await newLead.save();
            }
            await registerModel.findOneAndUpdate(
                { mobileNumber: dataToStore.mobileNumber },
                { $set: { leadId: externalLeadId } }
            );
            console.log("🚀 ~ leadApiBusinessLoan ~ leadDoc:", leadDoc);

            console.log("Register model updated with leadId:", externalLeadId);

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
                        businessLoanRef: leadDoc?._id || undefined,
                        registerRef: registerDoc?._id || undefined,
                        loginCountRef: loginCountDoc?._id || undefined,
                        appliedCustomerRef: appliedCustomerDoc?._id || undefined,
                    },
                },
                { new: true, upsert: true }
            );
            const allDetailsDoc = await allDetailsModel.findOne({ leadId: externalLeadId });
            console.log("Stored AllDetails doc in bl:", JSON.stringify(allDetailsDoc, null, 2));
            return res.status(200).json({
                success: true,
                message: 'Business Loan Lead created successfully.',
                leadId: externalLeadId,
                userId: leadDoc._id
            });
        } else {
            return res.status(400).json({
                success: false,
                message: 'Not eligible',
            });
        }
    } catch (err) {
        console.error("Error calling API:", err.response?.data || err);
        return res.status(500).json({ message: "Internal Server Error" });
    }
};

export const getBusinessDetailsByLead = async (req, res) => {
    const { leadId } = req.params;
    console.log("🚀 ~ getBusinessDetailsByLead ~ leadId:", leadId)
    try {
        // Find the record by leadId
        const businessLoanData = await businessLoanModal.findOne({ leadId });

        console.log("🚀 ~ getBusinessDetailsByLead ~ businessLoanData:", businessLoanData)
        if (!businessLoanData) {
            console.log("No business lead data found", businessLoanData)

            return res.status(404).json({ message: 'Business loan details not found.' });

        }

        return res.status(200).json(businessLoanData);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Server Error' });
    }
}
export const updateBusinessDetailsByLead = async (req, res) => {
    const { leadId } = req.params;

    // Reuse the same schema from POST controllerp
    const businessLoanSchema = Joi.object({

        email: Joi.string().email().required(),
        pincode: Joi.string().required(),
        pan: Joi.string().required(),
        consumerConsentDate: Joi.date().optional(),
        consumerConsentIp: Joi.string().optional(),
        businessRegistrationType: Joi.number().valid(1, 2, 3, 4, 5, 6, 7, 8).optional(),
        dob: Joi.string().required(),
        employmentStatus: Joi.number().valid(1, 2).optional(),
        referal: Joi.string().allow('', null).optional(),

        // businessProof: Joi.number().valid(1, 2, 3, 4, 5, 6, 7, 8).optional(),

        businessCurrentTurnover: Joi.number().valid(1, 2, 3, 4).optional(),


        businessYears: Joi.number().valid(1, 2).optional(),


        businessAccount: Joi.number().valid(1, 2).optional(),


        residenceType: Joi.number().valid(1, 2).optional(),



        monthlyIncome: Joi.number().required(),
        leadId: Joi.string().optional()
    });

    const { error, value } = businessLoanSchema.validate(req.body, { abortEarly: false });

    if (error) {
        return res.status(400).json({
            message: "Validation Failed",
            errors: error.details.map(err => err.message)
        });
    }

    try {
        const existingLead = await businessLoanModal.findOne({ leadId });

        if (!existingLead) {
            return res.status(404).json({ message: 'Business loan lead not found.' });
        }

        const updatedLead = await businessLoanModal.findOneAndUpdate(
            { leadId },
            { ...value },
            { new: true }
        );

        return res.status(200).json({
            success: true,
            message: 'Business loan details updated successfully.',
            updatedLead
        });
    } catch (err) {
        console.error('Error updating business details:', err);
        return res.status(500).json({ message: 'Internal Server Error' });
    }
};
