package httpserver

import (
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strings"

	"github.com/daniiarkg/nexora_platform/backend/internal/models"
	"github.com/daniiarkg/nexora_platform/backend/internal/store"
)

var graphIDPartPattern = regexp.MustCompile(`[a-z0-9]+`)

var allowedGraphIcons = map[string]struct{}{
	"Zap":          {},
	"Webhook":      {},
	"BrainCircuit": {},
	"DatabaseZap":  {},
	"MailCheck":    {},
	"Boxes":        {},
	"ShieldCheck":  {},
	"Rocket":       {},
}

func (s *Server) editGraph(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.currentUser(w, r); !ok {
		return
	}

	var input models.GraphEditRequest
	if err := readJSON(w, r, &input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	if input.SessionID == "" {
		input.SessionID = store.NewID()
	}
	if err := validateGraphEditRequest(input); err != nil {
		writeJSON(w, http.StatusUnprocessableEntity, map[string]string{"error": err.Error()})
		return
	}

	input.Graph = normalizeAutomationGraph(input.Graph)
	plan, err := s.ai.GenerateGraphEdit(r.Context(), input)
	if err != nil {
		s.logger.Error("gemini graph edit failed", "error", err)
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "ai graph edit failed"})
		return
	}

	graph, appliedCommands, err := applyGraphEditCommands(input.Graph, input.Mode, plan.Commands)
	if err != nil {
		s.logger.Error("apply graph edit failed", "error", err)
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "ai graph edit was invalid"})
		return
	}
	if err := validateAutomationGraphForEdit(graph, input.Mode == "create"); err != nil {
		s.logger.Error("validate edited graph failed", "error", err)
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "ai graph edit produced invalid graph"})
		return
	}

	if err := s.cache.AppendChatLog(
		r.Context(),
		input.SessionID,
		[]models.ChatMessage{{Role: "user", Content: input.Prompt}},
		plan.Message,
	); err != nil {
		s.logger.Warn("graph edit cache write failed", "error", err)
	}

	writeJSON(w, http.StatusOK, models.GraphEditResponse{
		SessionID: input.SessionID,
		Message:   plan.Message,
		Model:     s.ai.Model(),
		Title:     cleanGraphText(plan.Title, 120),
		Graph:     graph,
		Commands:  appliedCommands,
	})
}

func validateGraphEditRequest(input models.GraphEditRequest) error {
	mode := strings.TrimSpace(input.Mode)
	if mode != "create" && mode != "edit" {
		return errors.New("mode must be create or edit")
	}
	if length := len([]rune(strings.TrimSpace(input.Prompt))); length == 0 || length > 2000 {
		return errors.New("prompt must be 1-2000 characters")
	}
	return validateAutomationGraphForEdit(input.Graph, false)
}

func validateAutomationGraphForEdit(graph models.AutomationGraph, requireNodes bool) error {
	if requireNodes && len(graph.Nodes) == 0 {
		return errors.New("graph.nodes must contain at least one node")
	}
	if len(graph.Nodes) > 40 {
		return errors.New("graph.nodes must contain at most 40 nodes")
	}
	if len(graph.Edges) > 80 {
		return errors.New("graph.edges must contain at most 80 edges")
	}

	seen := make(map[string]struct{}, len(graph.Nodes))
	for _, node := range graph.Nodes {
		nodeID := strings.TrimSpace(node.ID)
		if nodeID == "" || len(nodeID) > 80 {
			return errors.New("each graph node requires an id below 80 characters")
		}
		if _, ok := seen[nodeID]; ok {
			return errors.New("graph node ids must be unique")
		}
		seen[nodeID] = struct{}{}
		if strings.TrimSpace(node.Title) == "" || len([]rune(node.Title)) > 120 {
			return errors.New("each graph node requires a title below 120 characters")
		}
	}
	for _, edge := range graph.Edges {
		if _, ok := seen[edge.Source]; !ok {
			return errors.New("edge source must reference an existing node")
		}
		if _, ok := seen[edge.Target]; !ok {
			return errors.New("edge target must reference an existing node")
		}
	}
	return nil
}

func applyGraphEditCommands(
	current models.AutomationGraph,
	mode string,
	commands []models.GraphEditCommand,
) (models.AutomationGraph, []models.GraphEditCommand, error) {
	graph := normalizeAutomationGraph(current)
	applied := make([]models.GraphEditCommand, 0, len(commands))

	for _, command := range commands {
		action := strings.ToLower(strings.TrimSpace(command.Action))
		switch action {
		case "replace_graph", "set_graph", "create_graph":
			graph = normalizeAutomationGraph(models.AutomationGraph{
				Nodes: command.Nodes,
				Edges: command.Edges,
			})
			applied = append(applied, models.GraphEditCommand{
				Action: "replace_graph",
				Nodes:  graph.Nodes,
				Edges:  graph.Edges,
			})
		case "clear_graph":
			graph = models.AutomationGraph{Nodes: []models.GraphNode{}, Edges: []models.GraphEdge{}}
			applied = append(applied, models.GraphEditCommand{Action: "clear_graph"})
		case "add_node":
			if command.Node == nil || len(graph.Nodes) >= 40 {
				continue
			}
			node := sanitizeGraphNode(*command.Node, len(graph.Nodes))
			node.ID = uniqueNodeID(node.ID, nodeIDSet(graph.Nodes))
			graph.Nodes = append(graph.Nodes, node)
			applied = append(applied, models.GraphEditCommand{Action: "add_node", Node: &node})
		case "update_node":
			nodeID := command.ID
			if nodeID == "" && command.Node != nil {
				nodeID = command.Node.ID
			}
			if nodeID == "" {
				continue
			}
			if updateGraphNode(&graph, nodeID, command.Node, command) {
				applied = append(applied, models.GraphEditCommand{Action: "update_node", ID: slugifyGraphID(nodeID), Node: command.Node})
			}
		case "delete_node":
			nodeID := slugifyGraphID(command.ID)
			if nodeID == "" {
				continue
			}
			before := len(graph.Nodes)
			graph.Nodes = filterGraphNodes(graph.Nodes, nodeID)
			if len(graph.Nodes) != before {
				graph.Edges = filterConnectedGraphEdges(graph.Edges, nodeID)
				applied = append(applied, models.GraphEditCommand{Action: "delete_node", ID: nodeID})
			}
		case "connect", "add_edge", "create_edge", "add_connection":
			source := slugifyGraphID(command.Source)
			target := slugifyGraphID(command.Target)
			if source == "" || target == "" || source == target || !graphHasNode(graph, source) || !graphHasNode(graph, target) {
				continue
			}
			if graphHasEdge(graph, source, target) || len(graph.Edges) >= 80 {
				continue
			}
			edge := newGraphEdge(source, target)
			graph.Edges = append(graph.Edges, edge)
			applied = append(applied, models.GraphEditCommand{Action: "connect", Source: source, Target: target})
		case "delete_edge", "remove_edge", "disconnect":
			nextEdges, deleted := deleteGraphEdge(graph.Edges, command)
			if deleted {
				graph.Edges = nextEdges
				applied = append(applied, models.GraphEditCommand{
					Action: "delete_edge",
					ID:     cleanGraphText(command.ID, 100),
					Source: slugifyGraphID(command.Source),
					Target: slugifyGraphID(command.Target),
				})
			}
		}
	}

	if mode == "create" && len(graph.Nodes) == 0 {
		return graph, applied, errors.New("create mode did not produce nodes")
	}
	return normalizeAutomationGraph(graph), applied, nil
}

func normalizeAutomationGraph(graph models.AutomationGraph) models.AutomationGraph {
	nodes := make([]models.GraphNode, 0, min(len(graph.Nodes), 40))
	idMap := make(map[string]string, len(graph.Nodes)*2)
	seen := map[string]struct{}{}

	for index, node := range graph.Nodes {
		if len(nodes) >= 40 {
			break
		}
		rawID := strings.TrimSpace(node.ID)
		next := sanitizeGraphNode(node, index)
		next.ID = uniqueNodeID(next.ID, seen)
		seen[next.ID] = struct{}{}
		if rawID != "" {
			idMap[rawID] = next.ID
		}
		if slug := slugifyGraphID(rawID); slug != "" {
			idMap[slug] = next.ID
		}
		nodes = append(nodes, next)
	}

	edges := make([]models.GraphEdge, 0, min(len(graph.Edges), 80))
	seenEdges := map[string]struct{}{}
	for _, edge := range graph.Edges {
		if len(edges) >= 80 {
			break
		}
		source := resolveGraphEndpoint(edge.Source, idMap)
		target := resolveGraphEndpoint(edge.Target, idMap)
		if source == "" || target == "" || source == target {
			continue
		}
		if _, ok := seen[source]; !ok {
			continue
		}
		if _, ok := seen[target]; !ok {
			continue
		}
		key := source + "->" + target
		if _, ok := seenEdges[key]; ok {
			continue
		}
		seenEdges[key] = struct{}{}
		edges = append(edges, newGraphEdge(source, target))
	}

	return models.AutomationGraph{Nodes: nodes, Edges: edges}
}

func sanitizeGraphNode(node models.GraphNode, index int) models.GraphNode {
	title := cleanGraphText(node.Title, 120)
	nodeType := cleanGraphText(node.Type, 80)
	if nodeType == "" {
		nodeType = "Действие"
	}
	if title == "" {
		title = fmt.Sprintf("Шаг %d", index+1)
	}
	description := cleanGraphText(node.Description, 320)
	if description == "" {
		description = "Описание шага автоматизации."
	}
	icon := cleanGraphText(node.Icon, 40)
	if _, ok := allowedGraphIcons[icon]; !ok {
		icon = inferGraphIcon(nodeType, title)
	}

	position := node.Position
	if position.X == 0 && position.Y == 0 {
		position = models.GraphPosition{
			X: float64(180 + (index%4)*330),
			Y: float64(140 + (index/4)*190 + (index%2)*110),
		}
	}

	return models.GraphNode{
		ID:          sanitizeNodeID(node.ID, title, index),
		Type:        nodeType,
		Title:       title,
		Description: description,
		Icon:        icon,
		Position:    position,
		Metadata:    map[string]string{"source": "nexora-ai-graph-editor"},
	}
}

func sanitizeNodeID(raw string, title string, index int) string {
	if slug := slugifyGraphID(raw); slug != "" {
		return slug
	}
	if slug := slugifyGraphID(title); slug != "" {
		return slug
	}
	return fmt.Sprintf("node-%d", index+1)
}

func slugifyGraphID(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	parts := graphIDPartPattern.FindAllString(value, -1)
	if len(parts) == 0 {
		return ""
	}
	slug := strings.Join(parts, "-")
	if len(slug) > 70 {
		slug = strings.Trim(slug[:70], "-")
	}
	return slug
}

func uniqueNodeID(base string, seen map[string]struct{}) string {
	if base == "" {
		base = "node"
	}
	if _, ok := seen[base]; !ok {
		return base
	}
	for index := 2; index < 100; index++ {
		candidate := fmt.Sprintf("%s-%d", base, index)
		if _, ok := seen[candidate]; !ok {
			return candidate
		}
	}
	return fmt.Sprintf("%s-%d", base, len(seen)+1)
}

func cleanGraphText(value string, limit int) string {
	cleaned := strings.Join(strings.Fields(strings.TrimSpace(value)), " ")
	runes := []rune(cleaned)
	if limit > 0 && len(runes) > limit {
		return string(runes[:limit])
	}
	return cleaned
}

func inferGraphIcon(values ...string) string {
	text := strings.ToLower(strings.Join(values, " "))
	switch {
	case strings.Contains(text, "ai") || strings.Contains(text, "ии") || strings.Contains(text, "анализ"):
		return "BrainCircuit"
	case strings.Contains(text, "mail") || strings.Contains(text, "email") || strings.Contains(text, "уведом"):
		return "MailCheck"
	case strings.Contains(text, "data") || strings.Contains(text, "данн") || strings.Contains(text, "баз"):
		return "DatabaseZap"
	case strings.Contains(text, "crm") || strings.Contains(text, "задач") || strings.Contains(text, "операц"):
		return "Boxes"
	case strings.Contains(text, "безопас") || strings.Contains(text, "провер"):
		return "ShieldCheck"
	case strings.Contains(text, "старт") || strings.Contains(text, "триггер"):
		return "Zap"
	default:
		return "Webhook"
	}
}

func resolveGraphEndpoint(value string, idMap map[string]string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	if mapped, ok := idMap[value]; ok {
		return mapped
	}
	if mapped, ok := idMap[slugifyGraphID(value)]; ok {
		return mapped
	}
	return slugifyGraphID(value)
}

func newGraphEdge(source string, target string) models.GraphEdge {
	return models.GraphEdge{
		ID:     "edge-" + source + "-" + target,
		Source: source,
		Target: target,
	}
}

func nodeIDSet(nodes []models.GraphNode) map[string]struct{} {
	seen := make(map[string]struct{}, len(nodes))
	for _, node := range nodes {
		seen[node.ID] = struct{}{}
	}
	return seen
}

func updateGraphNode(
	graph *models.AutomationGraph,
	rawID string,
	patch *models.GraphNode,
	command models.GraphEditCommand,
) bool {
	nodeID := slugifyGraphID(rawID)
	if nodeID == "" {
		return false
	}
	for index, node := range graph.Nodes {
		if node.ID != nodeID {
			continue
		}
		next := node
		if patch != nil {
			if value := cleanGraphText(patch.Type, 80); value != "" {
				next.Type = value
			}
			if value := cleanGraphText(patch.Title, 120); value != "" {
				next.Title = value
			}
			if value := cleanGraphText(patch.Description, 320); value != "" {
				next.Description = value
			}
			if _, ok := allowedGraphIcons[patch.Icon]; ok {
				next.Icon = patch.Icon
			}
			if patch.Position.X != 0 || patch.Position.Y != 0 {
				next.Position = patch.Position
			}
		}
		if value := cleanGraphText(command.Type, 80); value != "" {
			next.Type = value
		}
		if value := cleanGraphText(command.Title, 120); value != "" {
			next.Title = value
		}
		if _, ok := allowedGraphIcons[command.Icon]; ok {
			next.Icon = command.Icon
		}
		if command.Position != nil && (command.Position.X != 0 || command.Position.Y != 0) {
			next.Position = *command.Position
		}
		graph.Nodes[index] = next
		return true
	}
	return false
}

func filterGraphNodes(nodes []models.GraphNode, nodeID string) []models.GraphNode {
	next := nodes[:0]
	for _, node := range nodes {
		if node.ID != nodeID {
			next = append(next, node)
		}
	}
	return next
}

func filterConnectedGraphEdges(edges []models.GraphEdge, nodeID string) []models.GraphEdge {
	next := edges[:0]
	for _, edge := range edges {
		if edge.Source != nodeID && edge.Target != nodeID {
			next = append(next, edge)
		}
	}
	return next
}

func graphHasNode(graph models.AutomationGraph, nodeID string) bool {
	for _, node := range graph.Nodes {
		if node.ID == nodeID {
			return true
		}
	}
	return false
}

func graphHasEdge(graph models.AutomationGraph, source string, target string) bool {
	for _, edge := range graph.Edges {
		if edge.Source == source && edge.Target == target {
			return true
		}
	}
	return false
}

func deleteGraphEdge(edges []models.GraphEdge, command models.GraphEditCommand) ([]models.GraphEdge, bool) {
	edgeID := cleanGraphText(command.ID, 100)
	source := slugifyGraphID(command.Source)
	target := slugifyGraphID(command.Target)
	deleted := false
	next := edges[:0]
	for _, edge := range edges {
		matchesID := edgeID != "" && edge.ID == edgeID
		matchesPair := source != "" && target != "" && edge.Source == source && edge.Target == target
		if matchesID || matchesPair {
			deleted = true
			continue
		}
		next = append(next, edge)
	}
	return next, deleted
}
