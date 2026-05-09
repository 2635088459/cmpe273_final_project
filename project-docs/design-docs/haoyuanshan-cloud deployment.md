# Cloud Deployment Explanation (Student Version)

## 1. Why we deploy to cloud
In this project, we need to do demos and team testing.
If everything only runs on one local laptop, it is hard for other teammates to access, and it is not stable.
After deploying to cloud, services are easier to share and closer to a real production workflow.

## 2. What we deployed
We deployed a microservice system, including:
- frontend service
- backend service
- proof service
- message queue and cache (RabbitMQ, Redis)
- database (PostgreSQL)
- monitoring tools (Prometheus, Grafana, Jaeger)

Each service is packaged as a Docker image, so the runtime environment is more consistent.

## 3. Basic deployment process
Our process is mostly fixed:
1. Build Docker images for each service.
2. Push images to container registry.
3. Update Kubernetes yaml files and image tags.
4. Apply deployment to the cluster.
5. Check pod status and health endpoints.
6. Run a simple validation from frontend and API.

When we fix bugs, we usually repeat the same process.

## 4. Problems we met
Common cloud deployment issues were:
- image tag not updated, so code was not the latest version
- missing environment variables
- a service started before dependency services were ready
- wrong ingress route or wrong port mapping

These issues caused API errors at the beginning.

## 5. How we fixed them
We fixed them with these actions:
- use clear image tags with date/version
- re-check ConfigMap and Secret values
- add retry logic and health checks
- verify ingress routes and service ports
- redeploy and validate again

After these fixes, the demo became much more stable.

## 6. What I learned
From this task, I learned:
- cloud deployment is not only running commands; we need to check step by step
- logs and monitoring are very important for troubleshooting
- clear naming and versioning save a lot of time

Overall, this practice helped me better understand how real software is delivered online.
