import { createContainer, removeContainer, runContainerAction } from "./containers";
import { deleteServerRow, markServerError, setServerStatus } from "./repository";
import { reconcileServer } from "./sync";
import type { Server } from "./types";
import { dockerNotFound, errorMessage } from "./utils";

export async function provisionServer(server: Server, autoStart: boolean) {
  try {
    const created = await createContainer(server);

    if (autoStart) {
      await setServerStatus(server.id, "starting");
      await runContainerAction(created, "start");
      await reconcileServer(created);
    }
  } catch (error) {
    await markServerError(server, errorMessage(error, "Container create failed"));
  }
}

export async function runLifecycleJob(server: Server, action: "start" | "stop" | "restart" | "kill") {
  try {
    await runContainerAction(server, action);
    await reconcileServer(server);
  } catch (error) {
    if (dockerNotFound(error) && action === "start") {
      const recreated = await createContainer(server);
      await setServerStatus(server.id, "starting");
      await runContainerAction(recreated, "start");
      await reconcileServer(recreated);
      return;
    }

    await markServerError(server, errorMessage(error, `Container ${action} failed`));
  }
}

export async function recreateServer(server: Server, wasRunning: boolean) {
  try {
    await setServerStatus(server.id, "creating");
    await removeContainer(server, false);
    const recreated = await createContainer(server);

    if (wasRunning) {
      await setServerStatus(server.id, "starting");
      await runContainerAction(recreated, "start");
    }

    await reconcileServer(recreated);
  } catch (error) {
    await markServerError(server, errorMessage(error, "Container recreate failed"));
  }
}

export async function deleteServerJob(server: Server) {
  try {
    await removeContainer(server, true);
    await deleteServerRow(server.id);
  } catch (error) {
    await markServerError(server, errorMessage(error, "Container delete failed"));
  }
}
