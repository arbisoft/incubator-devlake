#!/usr/bin/env bash
#
# Creates the read-only account Grafana uses for its DevLake datasource.
#
# The benchmark cluster separates `lake` (read-write, used by the ETL) from
# `grafana_ro` (SELECT only). That separation does two things: it stops a
# dashboard query from writing to the DevLake schema, and it is what makes the
# per-user query governor in ../devlake.cnf possible at all -- init_connect can
# only be scoped by account name.
#
# This must be a .sh and not a .sql: files under /docker-entrypoint-initdb.d
# with a .sql extension are piped to the client verbatim and are NOT
# environment-interpolated, so a .sql version would create an account whose
# password is the literal string "${GRAFANA_DB_PASSWORD}".
#
# Runs exactly once, on first initialisation of an empty data directory. On an
# existing volume it does not run -- create the account by hand if you are
# retrofitting this onto a already-initialised deployment.
#
set -euo pipefail

log() { printf '%s [%s] %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$1" "$2"; }

for var in MYSQL_ROOT_PASSWORD MYSQL_DATABASE GRAFANA_DB_USER GRAFANA_DB_PASSWORD; do
    if [ -z "${!var:-}" ]; then
        log ERROR "$var is not set; refusing to initialise the Grafana account"
        exit 1
    fi
done

# Keep the governor's hardcoded account name honest. devlake.cnf compares
# against the literal 'grafana_ro', so a different username here would leave
# Grafana's queries uncapped with no error raised anywhere.
if [ "${GRAFANA_DB_USER}" != "grafana_ro" ]; then
    log ERROR "GRAFANA_DB_USER is '${GRAFANA_DB_USER}' but mysql/devlake.cnf's"
    log ERROR "init_connect governor is hardcoded to 'grafana_ro'. Change both"
    log ERROR "or the per-user query time limit silently stops applying."
    exit 1
fi

log INFO "creating read-only Grafana account '${GRAFANA_DB_USER}' on '${MYSQL_DATABASE}'"

# --protocol=socket: the TCP listener is not up yet during initdb.
# Password via MYSQL_PWD so it stays out of the process list.
MYSQL_PWD="${MYSQL_ROOT_PASSWORD}" mysql --protocol=socket -uroot <<-SQL
	CREATE USER IF NOT EXISTS '${GRAFANA_DB_USER}'@'%'
	    IDENTIFIED BY '${GRAFANA_DB_PASSWORD}';
	ALTER USER '${GRAFANA_DB_USER}'@'%'
	    IDENTIFIED BY '${GRAFANA_DB_PASSWORD}';
	GRANT SELECT ON \`${MYSQL_DATABASE}\`.* TO '${GRAFANA_DB_USER}'@'%';
SQL

log INFO "done"
