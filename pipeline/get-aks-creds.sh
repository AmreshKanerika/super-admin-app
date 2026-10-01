#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# Get AKS credentials (writes ~/.kube/config) and resolve Azure Portal
# deep-link URLs used by the success/failure summaries.
#
# Required env vars:
#   AKS_RG       - resource group containing the cluster
#   AKS_CLUSTER  - cluster name
#
# Outputs (pipeline variables for subsequent steps in the same job):
#   SUB_ID, TENANT_ID, INSIGHTS_URL, LOGS_URL, WORKLOADS_URL
#
# Prereqs: must run inside an AzureCLI@2 task so `az` is authenticated.
# -----------------------------------------------------------------------------
set -euo pipefail

az aks get-credentials \
  --resource-group "${AKS_RG}" \
  --name "${AKS_CLUSTER}" \
  --overwrite-existing

SUB_ID=$(az account show --query id -o tsv)
TENANT_ID=$(az account show --query tenantId -o tsv)

AKS_RESOURCE_ID="/subscriptions/${SUB_ID}/resourceGroups/${AKS_RG}/providers/Microsoft.ContainerService/managedClusters/${AKS_CLUSTER}"

INSIGHTS_URL="https://portal.azure.com/#@${TENANT_ID}/resource${AKS_RESOURCE_ID}/insights"
LOGS_URL="https://portal.azure.com/#@${TENANT_ID}/resource${AKS_RESOURCE_ID}/logs"
WORKLOADS_URL="https://portal.azure.com/#@${TENANT_ID}/resource${AKS_RESOURCE_ID}/workloads"

echo "##vso[task.setvariable variable=SUB_ID]${SUB_ID}"
echo "##vso[task.setvariable variable=TENANT_ID]${TENANT_ID}"
echo "##vso[task.setvariable variable=INSIGHTS_URL]${INSIGHTS_URL}"
echo "##vso[task.setvariable variable=LOGS_URL]${LOGS_URL}"
echo "##vso[task.setvariable variable=WORKLOADS_URL]${WORKLOADS_URL}"
