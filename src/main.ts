import { ManagerConfiguration } from "./config"
import { ExpressApp } from "./express-app"
import { ContainerSet, Container } from "./container"
import util = require("util")
import { DockerManager } from "./docker-manager";

let config: ManagerConfiguration = {
  port: 5000,
  docker: {
    type: "socket",
    socket: "/var/run/docker.sock"
  }
}
let manager = new DockerManager(config);
let app = new ExpressApp(config, manager);

// let fedoraContainer1: Container = {
//   name: "Fedora-1",
//   image: "fedora",
//   args: ["bash"],
//   isStarted: false
// }


// let fedoraContainer2: Container = {
//   name: "Fedora-2",
//   image: "fedora",
//   args: ["bash"],
//   isStarted: false
// }

// let containerSet: ContainerSet = {
//   id: "admin-flow-1",
//   name: "flow-1",
//   containers: [ fedoraContainer1, fedoraContainer2 ]
// }

// function createNetworkFailureCbk(networkName: string, error: string) {
  
// }
// function createContainerFailureCbk(container: Container, error: string) {
// }

// function startContainerFailureCbk(container: Container, error: string) {

// }
// function finishedCbk(containers: ContainerSet) {
//   console.log("Now removing everything.")
//   manager.killAndRemoveContainerSet(containerSet.id, killFailureCbk, networkFailureCbk, emptyFinishedCbk);
// }
// function killFailureCbk(container: Container, error: string) {
// }

// function networkFailureCbk(networkName: string, error: string) {

// }
// function emptyFinishedCbk() {

// }

// manager.setupAndRunContainerSet(containerSet, "sample-network", 
//     createNetworkFailureCbk, createContainerFailureCbk, 
//     startContainerFailureCbk, finishedCbk);

