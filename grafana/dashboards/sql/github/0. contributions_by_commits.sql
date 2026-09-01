-- Counts distinct commits authored in the window per contributor, scoped to repos mapped to the selected project, top 20 by commit count.
SELECT REPLACE(COALESCE(a.full_name, author_name, author_email),
	'-', ' ') as Contributor,
 basetwo.commit_count AS `Commit Count`
FROM
(
	SELECT base.commit_count,
		(
			SELECT MIN(id) FROM accounts a 
			where a.email = base.author_email
		) AS distinct_author_id, base.author_email , author_name
	FROM
	(
		SELECT count(c.sha) commit_count, c.author_email, c.author_name 
		FROM commits c
	  	JOIN repo_commits rc       ON rc.commit_sha = c.sha
			AND rc.repo_id in ( $repo_id ) 
	    	AND rc.repo_id in (
		        select pm.row_id 
		        from project_mapping pm 
		        where pm.`table` = 'repos' and pm.project_name in ( ${project} )
		        )
		WHERE $__timeFilter(c.authored_date)
		GROUP BY author_email, author_name 
		ORDER BY commit_count  desc
	) base
) basetwo
JOIN accounts a ON basetwo.distinct_author_id  = a.id
WHERE distinct_author_id IN ( $developer_id ) 
LIMIT 20;

