import app from "../../../index";
import { getArgFlag } from "./utils";
import { startHonoServer } from "../../http/server";

export async function cmdServe(): Promise<void> {
  const portStr = getArgFlag("port");
  await startHonoServer(app, { port: portStr ?? undefined });
}

