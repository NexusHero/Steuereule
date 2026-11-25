#!/usr/bin/env bash
# The TLS certificate of the local inbox (Mailpit). Mail is never sent in clear text, not even to the local test
# inbox: Mailpit accepts SMTP only over implicit TLS, and the API verifies its certificate against the CA made here
# (SMTP_CA_CERT). The CA and the server key are generated on this machine and never committed (.local/ is ignored).
#
#   scripts/mail-tls.sh [directory]    (default: .local/mail-tls)
#
# Writes ca/ca.pem (the trust anchor the API reads) and server/server.pem with server/server-key.pem (Mailpit's
# certificate and key, valid for the names mailpit, localhost and 127.0.0.1). Two directories, so a container that
# only needs the CA is never handed the key. The CA's private key exists only while the server
# certificate is signed and is deleted afterwards, so nothing else can be signed with it. A certificate that is
# still valid for more than a week and verifies against ca.pem is kept; otherwise all three are made anew.
# scripts/local.sh and CI run this before the compose stack starts. It prints a line only when it made new files.
set -euo pipefail

cd "$(dirname "$0")/.."
dir="${1:-.local/mail-tls}"
mkdir -p "$dir/ca" "$dir/server"

ca="$dir/ca/ca.pem"
cert="$dir/server/server.pem"
key="$dir/server/server-key.pem"

if [[ -s "$ca" && -s "$cert" && -s "$key" ]] \
  && openssl x509 -in "$cert" -noout -checkend 604800 >/dev/null 2>&1 \
  && openssl verify -CAfile "$ca" "$cert" >/dev/null 2>&1; then
  exit 0
fi

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

# One config per certificate, each naming its subject: LibreSSL (macOS) ignores -subj next to a config's subject.
cat >"$work/ca.cnf" <<'CNF'
[req]
distinguished_name = dn
prompt = no
x509_extensions = ca
[dn]
CN = SteuerEule local mail CA
[ca]
basicConstraints = critical, CA:TRUE, pathlen:0
keyUsage = critical, keyCertSign, cRLSign
subjectKeyIdentifier = hash
CNF
cat >"$work/server.cnf" <<'CNF'
[req]
distinguished_name = dn
prompt = no
[dn]
CN = mailpit
[server]
basicConstraints = critical, CA:FALSE
keyUsage = critical, digitalSignature
extendedKeyUsage = serverAuth
subjectAltName = DNS:mailpit, DNS:localhost, IP:127.0.0.1
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid
CNF

openssl ecparam -name prime256v1 -genkey -noout -out "$work/ca-key.pem"
openssl req -new -x509 -config "$work/ca.cnf" -key "$work/ca-key.pem" -days 825 -sha256 -out "$work/ca.pem"

openssl ecparam -name prime256v1 -genkey -noout -out "$work/server-key.pem"
openssl req -new -config "$work/server.cnf" -key "$work/server-key.pem" -out "$work/server.csr"
openssl x509 -req -in "$work/server.csr" -CA "$work/ca.pem" -CAkey "$work/ca-key.pem" \
  -set_serial "0x$(openssl rand -hex 16)" -days 825 -sha256 \
  -extfile "$work/server.cnf" -extensions server -out "$work/server.pem"

openssl verify -CAfile "$work/ca.pem" "$work/server.pem" >/dev/null

# The key stays readable by its owner only; Mailpit reads it as root inside its container.
install -m 600 "$work/server-key.pem" "$key"
install -m 644 "$work/server.pem" "$cert"
install -m 644 "$work/ca.pem" "$ca"
echo "Local mail TLS certificate written to $dir (CA: $ca)"
