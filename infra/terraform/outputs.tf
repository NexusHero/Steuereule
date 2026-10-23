# ---------------------------------------------------------------------------
# What the rest of the track consumes from this module. Note what is deliberately NOT
# an output: the kubeconfig. It is a credential and must never be printed into plan
# output/logs/state — it lives on the node and is fetched over SSH (see the hint below),
# and infra/.gitignore keeps any local copy out of git.
# ---------------------------------------------------------------------------

output "server_public_ip" {
  value       = hcloud_server.k3s[*].ipv4_address
  description = "Public IP(s) of the k3s node(s). Point the A record(s) for var.domain here."
}

output "kubeconfig_hint" {
  value = join("\n", [
    "Fetch the kubeconfig from the node (do NOT commit it — infra/.gitignore ignores *.kubeconfig):",
    "  scp root@<server_ip>:/etc/rancher/k3s/k3s.yaml ./kubeconfig",
    "  # then edit the server address from 127.0.0.1 to the node's public IP/domain",
  ])
  description = "How to obtain the kubeconfig without leaking it through Terraform state."
}
