import { Router, type IRouter } from "express";
import healthRouter from "./health";
import electoralRollRouter from "./electoral-roll";

const router: IRouter = Router();

router.use(healthRouter);
router.use(electoralRollRouter);

export default router;
