# Integration Service
This integration service is to connect DevLake with 3rd party systems. All of the systems who want to take data from DevLake must interact only with Integration Service, not directly with DevLake.

## Technology Stack
- Backend: .NET 10, I have selected this stack because I have better knowledge of managing multi-threaded operations.
- Database: PostgreSQL / MySQL, any of these DBs would be work.
- Queuing System: RabbitMQ / MassTransit, totally depends upon the availability of on-prem resources.

## Communication
I have selected Asynchronous mode of communication for this service, such that if there are too many requests coming in from the client system then the service would simply push the request to queuing system, and would process it on its own processing time.

Secondly, the data required from Sophia against single engineer can cause frequent API timeouts, hence async communication is the best option.

## Authentication
I have selected OAuth2 Authentication Mode, the client will be first registered on the integration service. A Client ID and Secret will be created for the client, client will pass these 2 values to our systems auth API, and will receive a JWT token to access the APIs.

## Architecture Diagram
As per my understanding, current DevLake system is the right hand side of the diagram. I have added the left side of the diagram for integration with Sophia and other systems.

```mermaid
architecture-beta

    service integration_service(server)[Integration Service]
    service sophia(cloud)[Sophia]
    service devlake(server)[DevLake Backend]
    service integration_db(database)[Integration DB]
    service devlake_db(database)[DevLake DB]
    service erp(cloud)[Workstream]
    service sqs(database)[Queue]
    service grafana(server)[Grafana]
    service acl(server)[Access Control]
    service devlake_fe(internet)[DevLake Frontend]
    junction integrationJunction
    junction aclJunction

    integration_service:R -- L:devlake
    integration_db:T -- B:integration_service
    sophia:R -- L:integrationJunction
    erp:B -- T:integrationJunction
    integrationJunction:B -- T:integration_service
    
    devlake_db:T -- B:devlake
    acl:L -- R:devlake
    acl:B -- T:grafana
    integration_service:L -- R:sqs

    devlake_fe:B -- T:devlake
    devlake_fe:R -- L:aclJunction
    acl:T -- B:aclJunction
```

## Domain Diagram

```mermaid
erDiagram

    EmailMappings {
        bigint id PK
        string arbisoftEmail
        string email
        DateTime createdOn
    }

    Clients {
        bigint id PK
        string name
        string clientId UK
        string clientSecret UK
        DateTime createdOn
    }

    ClientConfigs {
        bigint id PK
        bigint clientId FK
        string outboundClientId
        string outboundClientSecret
    }

    ClientConfigOutboundUrls {
        bigint id PK
        bigint clientConfigId FK
        string url
        string method
        string createdOn
        DateTime createdBy
        string modifiedOn
        DateTime? modifiedBy
    }

    RequestLogs {
        bigint id PK
        string clientId FK
        string correlationId
        string url
        string status
        string eventType
        DateTime createdOn
    }

    RequestLogJsons {
        bigint id PK
        bigint requestLogId FK
        string json
    }

    RequestResponseAttempts {
        bigint id PK
        bigint requestLogId FK
        string responseJson
        string attemptStatus
        string? failureError
        string attemptBy
        DateTime attemptOn
    }


    Clients ||--o{ RequestLogs : clientId
    Clients ||--o{ ClientConfigs : clientId
    ClientConfigs ||--o{ ClientConfigOutboundUrls : clientConfigId
    RequestLogs ||--o{ RequestLogJsons : requestLogId
    RequestLogs ||--o{ RequestResponseAttempts : requestLogId

```
- EmailMappings: This table has the mapping between Arbisoft email and other emails, using which the engineers are commiting on GitHub.
- Clients: This table has ClientID and ClientSecret for the 3rd party systems.
- ClientConfigs: This table has the configuration (ClientID & ClientSecret) using which Integration Service will authenticate itself to send data to this client.
- ClientConfigOutboundUrls: This table has the API URLs and the HTTP Methods on which integration service will send data.
- RequestLogs: This table keeps the record of the requests coming in the system, and also the status of the request's response. Status = Received/Queued/Processed/Success/Failed
- RequestLogJsons: This table has the JSON of the request log.
- RequestResponseAttempts: This table has the response and the status, as well as the attempts made to send the data on the configured Outbound URL.

## Sequence Diagram
### 1. Loading Projects on DevLake
```mermaid
sequenceDiagram
    box Reality
        actor Ubaid
    end
    box DevLake
        participant projectIngestionApi@{ "type": "boundary" } as Project Ingestion API
    end
    box Integration Service
        participant erpIntegrationApi@{ "type": "boundary" } as ERP Integration API
    end
    box Workstream
        participant erpAuthApi@{ "type": "boundary" } as Auth API
        participant projectsApi@{ "type": "boundary" } as Projects API
    end

    Ubaid->>+projectIngestionApi: Load Projects
    projectIngestionApi->>+erpIntegrationApi: GET: /fetch/projects
    erpIntegrationApi->>+erpAuthApi: POST: /auth ClientID & ClientSecret
    erpAuthApi-->>-erpIntegrationApi: JWT

    loop on all pages
        erpIntegrationApi->>+projectsApi: GET: /projects?page=1&pageSize=10
        projectsApi-->>-erpIntegrationApi: Projects Page
    end

    erpIntegrationApi-->>-projectIngestionApi: Merged projects & team lead data
    projectIngestionApi-->-Ubaid: Success Message
```

### 2. Sophia asking for data

#### Pushing Requests in Queue
```mermaid
sequenceDiagram
    participant Sophia
    box Integration Service
        participant authApi@{ "type": "boundary" } as Auth API
        participant authService as Auth Service
        participant stats_api@{ "type": "boundary" } as Stats API
        participant idempotency_check as Idempotency Check
        participant request_handler as RequestHandler
        participant request_service as RequestService
        participant request_repository as RequestRepository
    end
    box Queue Container
        participant sqs@{ "type": "queue"} as Queue
    end
    box DB Container
        participant db@{ "type": "database" } as Database
    end

    Sophia->>+authApi: POST ClientID & Client Service
    authApi->>+authService:authenticate
    authService-->>-authApi:JWT
    authApi-->>-Sophia:JWT

    Sophia->>+stats_api: GET: /employee/{email}/stats

    stats_api->>+idempotency_check: Criteria based idempotency check
    idempotency_check-->>-stats_api: passed
    stats_api->>+request_handler: Handle Request JSON

    request_handler->>+request_service: Push & Log Request
    request_service->>+sqs: Enqueue Request JSON
    sqs-->>-request_service: Success Status
    request_service->>+request_repository: Log JSON in DB
    request_repository->>+db: save(json)
    db-->>-request_repository: Rows Changed Count
    request_repository-->>-request_service: Success status
    request_service-->>-request_handler: Success Status
    request_handler-->>-stats_api: Success Status

    stats_api-->>-Sophia: Acknowledgement/failure message
```

#### Processing Requests
```mermaid
sequenceDiagram
    box Integration Service
        participant cron_job@{ "type": "control" } as Cron Job
        participant request_handler as RequestHandler
        participant request_processor as RequestProcessor
        participant request_service as RequestService
    end
    box Queue Container
        participant sqs@{ "type": "queue"} as Queue
    end
    box DB Container
        participant db@{ "type": "database" } as Database
    end
    box DevLake
        participant stats_api@{ "type": "boundary" } as Stats API
    end
    box Sophia
        participant auth_api@{ "type": "boundary" } as Auth API
        participant listener_api@{ "type": "boundary" } as Listener API
    end

    cron_job->>+request_handler: Process Requests in last X minutes
    request_handler->>+request_processor:Process Request JSONs

    request_processor->>+auth_api: POST: /auth ClientID + Client Secret
    auth_api-->>-request_processor: JWT

    request_processor->>+sqs:Read Enqueued Requests in last X minutes
    sqs-->>-request_processor: Request JSONs

    loop on all JSONs
        request_processor->>+request_processor: Fetch all of the mapped email for the inbound Arbisoft email
        par Parallel Execution

            par Parallel Execution for each mapped email
                request_processor->>+stats_api: GET: /stats/{email}/jira
                stats_api-->>-request_processor: response
            end
            par Parallel Execution for each mapped email
                request_processor->>+stats_api: GET: /stats/{email}/github
                stats_api-->>-request_processor: response
            end
            par Parallel Execution for each mapped email
                request_processor->>+stats_api: GET: /stats/{email}/ai_usage
                stats_api-->>-request_processor: response
            end
            par Parallel Execution for each mapped email
                request_processor->>+stats_api: GET: /stats/{email}/ai_cost
                stats_api-->>-request_processor: response
            end
        end

        request_processor->>+listener_api: POST: /stats/{email}/
        listener_api-->>-request_processor: Success status

        request_processor->>+request_service: Update request log
        request_service->>+db: update(json)
        db-->>-request_service: Updated Rows Count
        request_service-->>-request_processor: Success status
    end
    
    request_processor-->>-request_handler: true

```

### 3. Sophia DevLake Flowchart
```mermaid
flowchart TD
    A((Start))-->B[ Get Stats by Employee Email API ]
    B-->C{Is Email correct?}
    C-->|True| D[/Fetch all mappings for the email/]
    C-->|False| E[Return error message]
    E--> X((Stop))
    D--> F{Spin Tasks for each email}
    F-->|Task 1| G[/Call DevLake Get stats API for email 1/]
    F-->|Task 2| H[/Call DevLake Get stats API for email 2/]
    F-->|Task X| I[/Call DevLake Get stats API for email X/]
    G-->J[Task.WhenAll]
    H-->J
    I-->J
    J-->|Then| K[Merge all of the stat results]
    K-->L[/Return stats to Sophia/]
    L-->X
```

