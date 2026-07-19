param([string]$BaseUrl="http://127.0.0.1:5080")
$ErrorActionPreference="Stop"
function Assert-Equal($actual,$expected,$message){if($actual -ne $expected){throw "$message. Expected '$expected', got '$actual'."}}
$health=Invoke-RestMethod "$BaseUrl/health/ready";Assert-Equal $health.status "ready" "Readiness failed"
$id=[guid]::NewGuid();$now=[DateTimeOffset]::UtcNow.ToString("o")
function New-Body([guid]$entryId){@{id=$entryId;entryType="Issue";title="Integration token expiry $id";summary="Checkout $id failed when the token expired";originalInput="Checkout $id failed because the token expired. We fixed token refresh and added monitoring.";problem="Checkout $id failed";rootCause="Token expired";solution="Refresh the token";prevention="Monitor token expiry";severity="High";project="IntegrationTest";module="Checkout";confidenceScore=.9;status="Active";tags=@("integration");technologies=@("PostgreSQL");createdAt=$now;updatedAt=$now}|ConvertTo-Json -Depth 5}
$created=Invoke-RestMethod "$BaseUrl/api/knowledge?allowDuplicate=false" -Method Post -ContentType "application/json" -Body (New-Body $id);Assert-Equal $created.id.ToString() $id.ToString() "Create failed"
Start-Sleep -Seconds 4
$list=Invoke-RestMethod "$BaseUrl/api/knowledge?project=IntegrationTest&page=1&pageSize=100";if(-not ($list.items.id -contains $id.ToString())){throw "Filtered pagination did not return the created entry."}
$revisions=Invoke-RestMethod "$BaseUrl/api/knowledge/$id/revisions";Assert-Equal $revisions.Count 1 "Initial revision missing"
$duplicateStatus=0;try{Invoke-WebRequest "$BaseUrl/api/knowledge?allowDuplicate=false" -Method Post -ContentType "application/json" -Body (New-Body ([guid]::NewGuid()))|Out-Null}catch{$duplicateStatus=[int]$_.Exception.Response.StatusCode};Assert-Equal $duplicateStatus 409 "Duplicate policy failed"
Invoke-RestMethod "$BaseUrl/api/knowledge/$id/archive" -Method Post;Assert-Equal (Invoke-RestMethod "$BaseUrl/api/knowledge/$id").status "Archived" "Archive failed"
Invoke-RestMethod "$BaseUrl/api/knowledge/$id/restore" -Method Post;Assert-Equal (Invoke-RestMethod "$BaseUrl/api/knowledge/$id").status "Active" "Restore failed"
Start-Sleep -Seconds 4
$answer=Invoke-RestMethod "$BaseUrl/api/assistant/ask" -Method Post -ContentType "application/json" -Body (@{question="Checkout $id failed when the token expired";history=@()}|ConvertTo-Json);Assert-Equal $answer.grounded $true "Grounded answer failed";if($answer.sources.Count -lt 1){throw "Grounded answer returned no citations."}
$metrics=Invoke-RestMethod "$BaseUrl/api/admin/metrics";Assert-Equal $metrics.jobs.failed 0 "Indexing job failed"
Write-Host "Integration API verification passed for $id"
