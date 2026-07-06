// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract Chatter {
    address public owner;
    uint256 public constant FEE_BPS = 1000;

    enum Phase { Registration, Commit, Reveal, Complete }

    struct Player {
        bool active;
        bytes32 commitment;
        uint8 color;
        uint8 prediction;
        uint8 score;
        bool revealed;
    }

    struct Season {
        Phase phase;
        uint256 entryFee;
        uint256 regEnd;
        uint256 comEnd;
        uint256 revEnd;
        address[] players;
        mapping(address => Player) data;
        uint256 pool;
        address winner;
        bool claimed;
        uint8 majority;
    }

    uint256 public seasonId;
    mapping(uint256 => Season) public seasons;

    event NewSeason(uint256 indexed id, uint256 fee, uint256 regEnd, uint256 comEnd, uint256 revEnd);
    event Entered(uint256 indexed season, address indexed player);
    event Committed(uint256 indexed season, address indexed player);
    event Revealed(uint256 indexed season, address indexed player, uint8 color, uint8 prediction);
    event Completed(uint256 indexed season, address winner, uint256 pool);
    event Claimed(uint256 indexed season, address winner, uint256 prize, uint256 fee);

    constructor() {
        owner = msg.sender;
    }

    function startSeason(uint256 _fee, uint256 _regDuration, uint256 _comDuration, uint256 _revDuration) external {
        require(msg.sender == owner, "!owner");
        seasonId++;
        Season storage s = seasons[seasonId];
        s.phase = Phase.Registration;
        s.entryFee = _fee;
        s.regEnd = block.timestamp + _regDuration;
        s.comEnd = block.timestamp + _regDuration + _comDuration;
        s.revEnd = block.timestamp + _regDuration + _comDuration + _revDuration;
        emit NewSeason(seasonId, _fee, s.regEnd, s.comEnd, s.revEnd);
    }

    function enter() external payable {
        Season storage s = seasons[seasonId];
        require(s.phase == Phase.Registration, "!reg");
        require(block.timestamp < s.regEnd, "reg ended");
        require(msg.value == s.entryFee, "fee");
        require(!s.data[msg.sender].active, "in");
        s.data[msg.sender].active = true;
        s.players.push(msg.sender);
        s.pool += msg.value;
        emit Entered(seasonId, msg.sender);
    }

    function commit(bytes32 _commitment) external {
        Season storage s = seasons[seasonId];
        if (s.phase == Phase.Registration) {
            require(block.timestamp >= s.regEnd, "reg");
            s.phase = Phase.Commit;
        }
        require(s.phase == Phase.Commit, "!commit");
        require(block.timestamp < s.comEnd, "com ended");
        require(s.data[msg.sender].active, "!active");
        require(s.data[msg.sender].commitment == bytes32(0), "done");
        s.data[msg.sender].commitment = _commitment;
        emit Committed(seasonId, msg.sender);
    }

    function reveal(uint8 _color, uint8 _prediction, bytes32 _salt) external {
        Season storage s = seasons[seasonId];
        if (s.phase == Phase.Commit) {
            require(block.timestamp >= s.comEnd, "com");
            s.phase = Phase.Reveal;
        }
        require(s.phase == Phase.Reveal, "!reveal");
        require(block.timestamp < s.revEnd, "rev ended");
        require(s.data[msg.sender].active, "!active");
        require(!s.data[msg.sender].revealed, "done");
        require(s.data[msg.sender].commitment == keccak256(abi.encodePacked(_color, _prediction, _salt)), "hash");
        require(_color < 3 && _prediction < 3, "range");
        s.data[msg.sender].color = _color;
        s.data[msg.sender].prediction = _prediction;
        s.data[msg.sender].revealed = true;
        emit Revealed(seasonId, msg.sender, _color, _prediction);
    }

    function complete() external {
        Season storage s = seasons[seasonId];
        require(s.phase != Phase.Complete, "done");
        require(s.phase != Phase.Registration, "!started");
        if (s.phase == Phase.Commit) {
            require(block.timestamp >= s.comEnd, "com not ended");
            s.phase = Phase.Reveal;
        }
        require(block.timestamp >= s.revEnd, "wait rev end");

        address[] memory _players = s.players;
        uint8[3] memory counts;
        uint256 revealedCount;

        for (uint256 i = 0; i < _players.length; i++) {
            Player storage p = s.data[_players[i]];
            if (p.revealed) {
                counts[p.color]++;
                revealedCount++;
            }
        }
        require(revealedCount > 0, "!revealed");

        uint8 maj;
        uint8 maxCount;
        for (uint8 i = 0; i < 3; i++) {
            if (counts[i] > maxCount) { maxCount = counts[i]; maj = i; }
        }
        s.majority = maj;

        uint256 bestScore;
        address best;
        bool hasWinner;

        for (uint256 i = 0; i < _players.length; i++) {
            Player storage p = s.data[_players[i]];
            if (p.revealed) {
                uint8 sc;
                if (p.color == maj) sc += 2;
                if (p.prediction == maj) sc += 1;
                p.score = sc;
                if (!hasWinner || sc > bestScore) {
                    bestScore = sc;
                    best = _players[i];
                    hasWinner = true;
                }
            }
        }

        s.winner = best;
        s.phase = Phase.Complete;
        emit Completed(seasonId, best, s.pool);
    }

    function claim(uint256 _seasonId) external {
        Season storage s = seasons[_seasonId];
        require(s.phase == Phase.Complete, "!complete");
        require(s.winner == msg.sender, "!winner");
        require(!s.claimed, "claimed");
        s.claimed = true;
        uint256 fee = (s.pool * FEE_BPS) / 10000;
        uint256 prize = s.pool - fee;
        if (fee > 0) payable(owner).transfer(fee);
        if (prize > 0) payable(msg.sender).transfer(prize);
        emit Claimed(_seasonId, msg.sender, prize, fee);
    }

    function withdrawStuck(uint256 _seasonId) external {
        require(msg.sender == owner, "!owner");
        Season storage s = seasons[_seasonId];
        require(block.timestamp > s.revEnd, "not ended");
        require(s.phase != Phase.Complete, "completed");
        uint256 bal = address(this).balance;
        if (bal > 0) payable(owner).transfer(bal);
    }

    function getPlayers(uint256 _seasonId) external view returns (address[] memory) {
        return seasons[_seasonId].players;
    }

    function getPlayerData(uint256 _seasonId, address _player) external view returns (bool, bool, uint8, uint8, uint8) {
        Player storage p = seasons[_seasonId].data[_player];
        return (p.active, p.revealed, p.color, p.prediction, p.score);
    }
}
