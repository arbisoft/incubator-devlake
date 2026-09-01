-- Sums additions and deletions per contributor across commits authored in the window (deduped by commit SHA), scoped to repos mapped to the selected project, top 20 by total lines changed.
WITH dedup AS (
	SELECT c.author_email, SUM(c.additions) AS tot_add, SUM(c.deletions) AS tot_del,
	(
		SELECT MIN(a.id)
		FROM accounts a
		WHERE a.email = c.author_email
	) as distinct_author_id,
	c.author_name 
	FROM commits c
  	JOIN repo_commits rc       ON rc.commit_sha = c.sha
		AND rc.repo_id in ( ${repo_id} ) 
    	AND rc.repo_id in (
	        select pm.row_id 
	        from project_mapping pm 
	        where pm.`table` = 'repos' and pm.project_name in ( ${project} )
	        )
	WHERE $__timeFilter(c.authored_date)
	GROUP BY c.author_email, c.author_name
	ORDER BY tot_add + tot_del desc
)

SELECT REPLACE(
	COALESCE(a.full_name, author_name, author_email),
	'-', ' ') AS contributor, tot_add AS 'Lines Added', tot_del AS 'Lines Removed'
FROM dedup 
JOIN accounts a ON a.id = distinct_author_id
WHERE distinct_author_id IN ( ${developer_id} )
LIMIT 20;