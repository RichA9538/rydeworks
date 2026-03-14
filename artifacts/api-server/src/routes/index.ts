import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import authRouter from "./auth.js";
import tripsRouter from "./trips.js";
import adminRouter from "./admin.js";
import superAdminRouter from "./superAdmin.js";
import paymentsRouter from "./payments.js";
import riderPortalRouter from "./rider-portal.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use('/auth', authRouter);
router.use('/trips', tripsRouter);
router.use('/admin', adminRouter);
router.use('/super-admin', superAdminRouter);
router.use('/payments', paymentsRouter);
router.use('/rider-portal', riderPortalRouter);

export default router;
