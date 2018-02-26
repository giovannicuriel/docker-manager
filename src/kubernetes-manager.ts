import { ContainerManagerInterface } from "./docker-manager";
import { ContainerSet } from "./container";
import Api = require("kubernetes-client");
import { ManagerConfiguration } from "./config";
import util = require("util");
import when = require("when");


interface K8sMetadata {
  [attribute : string] : any;
}

interface K8sSpec {
  [attribute : string] : any;
}

interface K8sManifest {
  apiVersion: "extensions/v1beta1",
  kind: "Namespace" | "Deployment",
  metadata: K8sMetadata,
  spec: K8sSpec,

}
        
interface ContainerTemplate {
  image: string;
  imagePullPolicy: "Never",
  name: string;
}

class KubernetesManager implements ContainerManagerInterface {
  host: string;

  constructor(config: ManagerConfiguration) {
    console.log("Using kubernetes driver.");
    if (config.engine == "kubernetes" && config.kubernetes) {
      this.host = config.kubernetes.url;
    } else {
      // Throw exception or return error
      this.host = "";
    }
  }

  setupAndRunContainerSet(containerSet: ContainerSet, namespace: string): When.Promise<ContainerSet> {
    return when.promise((resolve, reject) => {
      let deploymentObj: K8sManifest = {
        apiVersion: "extensions/v1beta1",
        kind: "Deployment",
        metadata: {
          labels: {
            name: containerSet.name
          },
          name: containerSet.name
        },
        spec: {
          replicas: 1,
          template: {
            metadata: {
              labels: {
                name: containerSet.name
              }
            },
            spec: {
              containers:[
              ],
              restartPolicy: "Always"
            }
          }
        }
      }

      for (let container of containerSet.containers) {
          let containerTemplate: ContainerTemplate = {
            name: container.name,
            image: container.image,
            imagePullPolicy: "Never"
          }
          deploymentObj.spec.template.spec.containers.push(containerTemplate);
      }
      const ext = new Api.Extensions({
        url: this.host,
        version: 'v1beta1'  // Defaults to 'v1beta1'
      });

      ext.namespaces!("default").deployments!.post({ body: deploymentObj}, (error, value) => {
        console.log("Error: " + util.inspect(error, {depth: null}));
        console.log("Value: " + util.inspect(value, {depth: null}));
        if (error == null) {
          resolve(containerSet);
        } else {
          reject(error);
        }
      });
    });
  }

  killAndRemoveContainerSet(containerSetId: string): When.Promise<number> {
    return when.promise((resolve, reject) => {
      const ext = new Api.Extensions({
        url: this.host,
        version: 'v1beta1'  // Defaults to 'v1beta1'
      });

      ext.namespaces!("default").deployments!(containerSetId).delete({ }, (error, value) => {
        console.log("Error: " + util.inspect(error, {depth: null}));
        console.log("Value: " + util.inspect(value, {depth: null}));
        if (error == null) {
          resolve(0);
        } else {
          reject(error);
        }
      });
    });
  }
}

export { KubernetesManager };