# EventHive Kubernetes Deployment Guide

## 1. Overview

This document provides complete instructions for deploying EventHive on Kubernetes. The setup is designed for lightweight local clusters (`kind` or `k3d`) as recommended by the DevOps course syllabus, as well as production Kubernetes clusters.

---

## 2. Architecture

```
                                 [ Kubernetes Cluster ]
                                            │
               ┌────────────────────────────┴────────────────────────────┐
               │                                                         │
               ▼                                                         ▼
    [ Service: eventhive-service ]                          [ Service: mongodb-service ]
           (NodePort: 30050)                                       (ClusterIP: 27017)
               │                                                         │
               ▼                                                         ▼
    [ Deployment: eventhive-app ]                              [ Deployment: mongodb ]
         (Replicas: 2)                                              (Replicas: 1)
         Pod 1: EventHive Container (:5000)                         Pod: MongoDB 6.0 (:27017)
         Pod 2: EventHive Container (:5000)                         Volume: /data/db
         Probes: /health (Liveness & Readiness)
```

---

## 3. Prerequisites

- `kubectl` (v1.26+)
- `docker` (v24.0+)
- `kind` (v0.20+) or `k3d` (v5.5+)

---

## 4. Container Image Specifications

- **Exact Image Name:** `ghcr.io/skit-devops-2026/devops-24eskcs005:latest`
- **Local Development Tag:** `eventhive:latest`

### Building & Tagging the Docker Image:
```bash
# Build the production Docker image locally
docker build -t eventhive:latest .

# Tag for GitHub Container Registry (GHCR)
docker tag eventhive:latest ghcr.io/skit-devops-2026/devops-24eskcs005:latest
```

### Pushing to Container Registry (GHCR):
```bash
# Login using GitHub Personal Access Token (PAT with write:packages)
echo $CR_PAT | docker login ghcr.io -u <github-username> --password-stdin

# Push the tagged image
docker push ghcr.io/skit-devops-2026/devops-24eskcs005:latest
```

---

## 5. Local Cluster Setup (kind / k3d)

### Option A: Using `kind` (Kubernetes in Docker)
```bash
# Create kind cluster mapping NodePort 30050 to host port 5000
cat <<EOF | kind create cluster --name eventhive-cluster --config=-
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes:
- role: control-plane
  extraPortMappings:
  - containerPort: 30050
    hostPort: 5000
    protocol: TCP
EOF

# Load local Docker image directly into kind (bypasses registry push)
kind load docker-image eventhive:latest --name eventhive-cluster
# Or load GHCR tagged image:
kind load docker-image ghcr.io/skit-devops-2026/devops-24eskcs005:latest --name eventhive-cluster
```

### Option B: Using `k3d` (k3s in Docker)
```bash
# Create k3d cluster with host port mapping
k3d cluster create eventhive-cluster -p "5000:30050@server:0"

# Import image into k3d
k3d image import eventhive:latest -c eventhive-cluster
```

---

## 6. Deploying Application Manifests

Apply all manifests in the `k8s/` directory:
```bash
# Apply using kustomize
kubectl apply -k k8s/

# Or apply manifests individually
kubectl apply -f k8s/mongodb.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
```

---

## 7. Verification & Status Checks

```bash
# Check Pod status (verify Running and 1/1 Ready)
kubectl get pods -o wide

# Check Deployment status
kubectl get deployments

# Check Services and NodePort mapping
kubectl get services

# Check Pod rollout status
kubectl rollout status deployment/eventhive-app

# Inspect Pod logs
kubectl logs -l app=eventhive --tail=50 -f
```

### Expected Output Example:
```text
NAME                             READY   STATUS    RESTARTS   AGE
eventhive-app-6d8b94f98b-abc12   1/1     Running   0          45s
eventhive-app-6d8b94f98b-xyz34   1/1     Running   0          45s
mongodb-7865c58bb7-def56         1/1     Running   0          60s

NAME                TYPE        CLUSTER-IP       EXTERNAL-IP   PORT(S)          AGE
eventhive-service   NodePort    10.96.120.45     <none>        5000:30050/TCP   45s
kubernetes          ClusterIP   10.96.0.1        <none>        443/TCP          2m
mongodb-service     ClusterIP   10.96.180.12     <none>        27017/TCP        60s
```

---

## 8. Accessing the Application

### Via NodePort (kind / k3d with port mapping):
Open browser at: `http://localhost:5000`

### Via Kubectl Port-Forward:
```bash
kubectl port-forward svc/eventhive-service 5000:5000
```
Then access:
- Application Web UI: `http://localhost:5000`
- Health Endpoint: `http://localhost:5000/health`
- Prometheus Metrics: `http://localhost:5000/metrics`

---

## 9. Troubleshooting

| Issue | Cause | Solution |
|---|---|---|
| `ImagePullBackOff` / `ErrImagePull` | Image not found in registry | Run `kind load docker-image ...` or push to GHCR. |
| `CrashLoopBackOff` | Database connection or memory failure | Check logs with `kubectl logs <pod-name>`. |
| Pod not becoming `Ready` | `/health` probe failing | Check probe logs via `kubectl describe pod <pod-name>`. |
| NodePort unreachable | Host port not forwarded | Use `kubectl port-forward svc/eventhive-service 5000:5000`. |
