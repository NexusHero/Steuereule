# ---------------------------------------------------------------------------
# The Hetzner Cloud skeleton. Everything here is declarative and idempotent, using
# the first-party `hetznercloud/hcloud` provider — ADR-049 already chose Hetzner; the
# "no Eigenbau, use the standard" rule says don't hand-roll what the provider does.
# Slice 1 ships the SHAPE; sub-ticket 06.1 turns it into real applied infra once the
# credentials from the checklist exist.
# ---------------------------------------------------------------------------

# --- Private network: node traffic (and, later, pod CIDRs) stay off the public NIC. ---
resource "hcloud_network" "cluster" {
  name     = "steuereule-k3s"
  ip_range = var.private_network_range
}

# --- Firewall: least privilege. ---
# Only SSH (22) for operators, 80/443 for the ingress, 6443 for the k3s API. Postgres
# is MANAGED (ADR-047/ADR-049) — deliberately NO 5432 rule here: the managed DB is
# reached via its own endpoint, never a public port on the cluster node.
resource "hcloud_firewall" "cluster" {
  name = "steuereule-k3s"

  rule {
    direction   = "in"
    protocol    = "tcp"
    port        = "22"
    source_ips  = ["0.0.0.0/0", "::/0"]
    description = "SSH for operators (tighten to a bastion/IP allow-list in 06.1)"
  }
  rule {
    direction   = "in"
    protocol    = "tcp"
    port        = "80"
    source_ips  = ["0.0.0.0/0", "::/0"]
    description = "HTTP — ingress redirects to HTTPS"
  }
  rule {
    direction   = "in"
    protocol    = "tcp"
    port        = "443"
    source_ips  = ["0.0.0.0/0", "::/0"]
    description = "HTTPS — the only public application entry"
  }
  rule {
    direction   = "in"
    protocol    = "tcp"
    port        = "6443"
    source_ips  = ["0.0.0.0/0"]
    description = "k3s API server — needed by kubectl/CI; tighten to operator/CI CIDRs before prod (06.1)"
  }
}

# --- k3s server node(s), bootstrapped via cloud-init on first boot. ---
# WHY cloud-init and not Ansible: k3s ships an official install script; cloud-init is
# the provider-native, zero-extra-tool way to run it once at boot. No second
# config-management layer to keep in sync for what is, today, a small cluster.
resource "hcloud_server" "k3s" {
  count       = var.node_count
  name        = "steuereule-k3s-${count.index}"
  image       = "ubuntu-24.04"
  server_type = var.server_type
  location    = var.location
  ssh_keys    = var.ssh_public_keys

  # Single-node needs no pre-shared token (k3s generates its own on first boot);
  # node_count > 1 needs the server token shared to agents — see k3s/cloud-init.yaml's
  # own comment (sub-ticket 06.1).
  user_data = file("${path.module}/../k3s/cloud-init.yaml")

  network {
    network_id = hcloud_network.cluster.id
  }

  firewall_ids = [hcloud_firewall.cluster.id]

  depends_on = [hcloud_network.cluster]
}
