# The state prefix is passed at init, one per environment, so two environments can never share a state:
#   tofu init -backend-config="bucket=<state bucket>" -backend-config="prefix=steuereule/<environment>"
# The first stack keeps steuereule/beta.
terraform {
  backend "gcs" {}
}
