/*
Licensed to the Apache Software Foundation (ASF) under one or more
contributor license agreements.  See the NOTICE file distributed with
this work for additional information regarding copyright ownership.
The ASF licenses this file to You under the Apache License, Version 2.0.
*/

package main

import (
	"github.com/apache/incubator-devlake/plugins/claude_otel/impl"
	"github.com/spf13/cobra"
)

var PluginEntry impl.ClaudeOtel

func main() {
	cmd := &cobra.Command{Use: "claude_otel"}
	cmd.Run = func(_ *cobra.Command, _ []string) { println("claude_otel plugin can only run in API") }
	if err := cmd.Execute(); err != nil {
		panic(err)
	}
}
