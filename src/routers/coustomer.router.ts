import { Router } from "express";
import {
    createCustomer,
    getCustomers,
    getCustomerById,
    updateCustomer
} from "../controllers/coustomer.controller.js";


const router = Router();

router.post(
    "/",
    createCustomer
);
router.get(
    "/",
    getCustomers
);
router.get(
    "/:id",
    getCustomerById
);
router.put(
    "/:id",
    updateCustomer
);



export default router;