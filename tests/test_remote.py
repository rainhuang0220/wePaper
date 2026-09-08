from wepaper.remote import ServerClient


def test_health_returns_false_when_server_refuses_connection() -> None:
    client = ServerClient("http://127.0.0.1:1", "token")
    assert client.health() is False


def test_health_returns_false_when_host_does_not_resolve() -> None:
    client = ServerClient("http://no-such-wepaper-host.invalid", "token")
    assert client.health() is False
