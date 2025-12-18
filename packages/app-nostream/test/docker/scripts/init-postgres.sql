-- Initialize databases for each Dassie node
-- This script runs once when PostgreSQL container starts

-- Create separate databases for each node (isolation)
CREATE DATABASE dassie_node0;
CREATE DATABASE dassie_node1;
CREATE DATABASE dassie_node2;
CREATE DATABASE dassie_node3;
CREATE DATABASE dassie_node4;

-- Grant permissions
GRANT ALL PRIVILEGES ON DATABASE dassie_node0 TO test;
GRANT ALL PRIVILEGES ON DATABASE dassie_node1 TO test;
GRANT ALL PRIVILEGES ON DATABASE dassie_node2 TO test;
GRANT ALL PRIVILEGES ON DATABASE dassie_node3 TO test;
GRANT ALL PRIVILEGES ON DATABASE dassie_node4 TO test;

-- Note: Dassie will auto-create tables via migrations when it starts
