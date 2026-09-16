.PHONY: psk-%
psk-%:
	git config push.autoSetupRemote true && git fetch origin development && git checkout -b $@ origin/development --no-track

.PHONY: wt-psk-%
wt-psk-%:
	git fetch origin development && git worktree add ../postsig-nextjs-psk-$* -b psk-$* origin/development --no-track
	@echo "Worktree created. Run:"
	@echo "  cd ../postsig-nextjs-psk-$*"

.PHONY: wt-clean
wt-clean:
	git worktree prune
	@echo "Pruned stale worktrees"

.PHONY: wt-list
wt-list:
	git worktree list
