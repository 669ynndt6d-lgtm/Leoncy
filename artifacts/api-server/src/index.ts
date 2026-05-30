import { Router, type IRouter } from "express";
import healthRouter from "./routes/health";

const router: IRouter = Router();

router.use(healthRouter);

export default router;
